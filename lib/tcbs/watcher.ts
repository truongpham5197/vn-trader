import { prisma } from "../prisma";
import { ownerId } from "../user";
import { getBool, getSetting, setSetting } from "../settings";
import { getQuote, formatQuoteLine } from "../price";
import { getOrder, getPositions, tcbsConfigured } from "./client";
import { esc, sendTelegram } from "../telegram/notify";
import { pushAlert } from "../alerts";
import { vnToday } from "../vn-time";
import { px } from "../format";
import { levelState } from "../risk/levels";

const HEARTBEAT_DELTA_PCT = 1;

/** T+2: số phiên đã trôi qua kể từ ngày mua (đếm bars sau ngày openedAt). */
async function sessionsHeld(symbolId: number, openedAt: Date): Promise<number> {
  const openedDate = openedAt.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  return prisma.dailyBar.count({
    where: { symbolId, date: { gt: openedDate } },
  });
}

/**
 * Stop-loss watcher — chạy mỗi phút trong phiên.
 * Paper: dùng giá DNSE; live: kiểm sellableQty + bắn lệnh NS/MP qua TCBS.
 */
export async function runWatcher(): Promise<void> {
  if (await getBool("killSwitch")) return;
  await watchOthers();

  // Chỉ vị thế của owner — cảnh báo đi Telegram owner, lệnh live bắn vào TCBS owner
  const allOpen = await prisma.trade.findMany({
    where: { status: "open", userId: await ownerId() },
    include: { symbol: true },
  });
  const openTrades = allOpen.filter((t) => t.stopPrice !== null);
  if (!allOpen.length && !(await prisma.order.count({ where: { status: "pending" } }))) return;

  // 1. Sync lệnh pending (live) → fill → mở Trade
  if (tcbsConfigured() && !(await getBool("paperTrading"))) {
    await syncPendingOrders();
  }

  // 2. Stop-loss + target alert
  for (const t of openTrades) {
    const quote = await getQuote(t.symbol.ticker);
    const price = quote.last;
    if (price === null) continue;
    const qLine = formatQuoteLine(quote);

    const held = await sessionsHeld(t.symbolId, t.openedAt);

    if (price <= (t.stopPrice ?? 0)) {
      if (!t.note?.includes("stop-hit")) await warnStop(t, price, qLine, held);
      continue;
    } else if (t.targetPrice && price >= t.targetPrice && !t.note?.includes("target-hit")) {
      // Mark TRƯỚC khi gửi — tránh spam mỗi phút khi giá nằm trên target
      await prisma.trade.update({
        where: { id: t.id },
        data: { note: `${t.note ?? ""} target-hit`.trim() },
      });
      await sendTelegram(
        `🎯 <b>${t.symbol.ticker}</b> chạm target ${px(t.targetPrice)} (giá ${px(price)})\n${qLine}`,
        undefined,
        { kind: "target", level: "success", ticker: t.symbol.ticker },
      );
    }
  }

  // 3. Heartbeat — chỉ gửi khi P&L dịch ≥1%pt so với lần báo trước (hoặc vị thế mới)
  await heartbeat();
}

/**
 * Vị thế của user khác owner: chỉ báo trên web (không Telegram, không tự đóng lệnh
 * — họ tự bán). Đánh dấu stop-hit/target-hit vào note để báo 1 lần.
 */
async function watchOthers(): Promise<void> {
  const trades = await prisma.trade.findMany({
    where: { status: "open", userId: { not: await ownerId() }, OR: [{ stopPrice: { not: null } }, { targetPrice: { not: null } }] },
    include: { symbol: true },
  });
  for (const t of trades) {
    const hitStop = t.stopPrice !== null && !t.note?.includes("stop-hit");
    const hitTarget = t.targetPrice !== null && !t.note?.includes("target-hit");
    if (!hitStop && !hitTarget) continue;
    const quote = await getQuote(t.symbol.ticker);
    const price = quote.last;
    if (price === null) continue;
    const kind = hitStop && price <= t.stopPrice! ? "stop" : hitTarget && price >= t.targetPrice! ? "target" : null;
    if (!kind) continue;
    await prisma.trade.update({ where: { id: t.id }, data: { note: `${t.note ?? ""} ${kind}-hit`.trim() } });
    const lv = levelState(price, kind === "stop" ? t.stopPrice : null, kind === "target" ? t.targetPrice : null)!;
    await pushAlert(
      `${kind === "stop" ? "🛑" : "🎯"} <b>${t.symbol.ticker}</b> ${lv.label}\n${lv.detail}\nApp chỉ cảnh báo, không bán hộ.\n${formatQuoteLine(quote)}`,
      { kind, level: kind === "stop" ? "danger" : "success", ticker: t.symbol.ticker, userId: t.userId },
    );
  }
}

async function heartbeat(): Promise<void> {
  const { positionsReport } = await import("../report/positions");
  const { positionsMessage } = await import("../report/portfolio");
  const lines = await positionsReport();
  if (!lines.length) return;
  const prev = JSON.parse((await getSetting("heartbeatPnl")) || "{}") as Record<string, number>;
  const cur: Record<string, number> = {};
  let moved = Object.keys(prev).length === 0; // lần đầu luôn báo 1 nhịp
  for (const l of lines) {
    if (l.pnlPct !== null) cur[l.ticker] = l.pnlPct;
    const p = prev[l.ticker];
    if (p === undefined || Math.abs((l.pnlPct ?? 0) - p) >= HEARTBEAT_DELTA_PCT) moved = true;
  }
  if (!moved) return;
  await sendTelegram(await positionsMessage(lines), undefined, { kind: "positions" });
  await setSetting("heartbeatPnl", JSON.stringify(cur));
}

/** Thủng cắt lỗ: báo 1 lần, không đóng vị thế, không đặt lệnh bán. */
async function warnStop(
  t: { id: number; symbol: { ticker: string }; stopPrice: number | null; note: string | null },
  price: number,
  qLine: string,
  held: number,
): Promise<void> {
  const trade = await prisma.trade.findUnique({ where: { id: t.id } });
  if (!trade || trade.status !== "open" || trade.note?.includes("stop-hit")) return;
  await prisma.trade.update({
    where: { id: t.id },
    data: { note: `${trade.note ?? ""} stop-hit`.trim() },
  });
  const lv = levelState(price, trade.stopPrice, null);
  const t2 = held < 2 ? ` Chưa đủ T+2 (đã giữ ${held} phiên).` : "";
  await sendTelegram(
    `🛑 <b>${esc(t.symbol.ticker)}</b> ${esc(lv?.label ?? "đã thủng cắt lỗ")}\n${esc(lv?.detail ?? "Giá đã xuống dưới cắt lỗ.")}${t2}\nApp chỉ cảnh báo, không bán hộ.\n${qLine}`,
    undefined,
    { kind: "stop", level: "danger", ticker: t.symbol.ticker },
  );
}

async function syncPendingOrders(): Promise<void> {
  const pending = await prisma.order.findMany({ where: { status: "pending" } });
  for (const o of pending) {
    if (!o.tcbsOrderId) continue;
    try {
      const od = await getOrder(o.tcbsOrderId);
      if (!od) continue;
      const filled = od.filledQty >= od.quantity && od.quantity > 0;
      if (filled) {
        const fillPrice = od.price > 0 ? od.price / 1000 : o.price; // VND → nghìn
        await prisma.order.update({
          where: { id: o.id },
          data: { status: "filled", filledAt: new Date() },
        });
        if (o.side === "BUY" && o.signalId) {
          const signal = await prisma.signal.findUnique({ where: { id: o.signalId } });
          const trade = await prisma.trade.create({
            data: {
              userId: await ownerId(),
              symbolId: o.signalId ? (await prisma.signal.findUnique({ where: { id: o.signalId }, select: { symbolId: true } }))!.symbolId : 0,
              qty: o.qty,
              entryPrice: fillPrice,
              stopPrice: signal?.stop ?? null,
              targetPrice: signal?.target ?? null,
              signalId: o.signalId,
            },
          });
          await prisma.order.update({ where: { id: o.id }, data: { tradeId: trade.id } });
          await prisma.signal.update({ where: { id: o.signalId }, data: { status: "filled" } });
        }
        await sendTelegram(`✅ Lệnh ${o.side} ${o.qty}cp khớp @ ${px(od.price)}`, undefined, { kind: "system", level: "success" });
      } else if (/cancel|reject/i.test(od.status)) {
        await prisma.order.update({ where: { id: o.id }, data: { status: "cancelled" } });
      }
    } catch (e) {
      console.error("[watcher] sync order", o.id, e);
    }
  }
}

/** Đồng bộ Position từ TCBS (live). */
export async function syncPositions(): Promise<number> {
  if (!tcbsConfigured()) return 0;
  const positions = await getPositions();
  for (const pos of positions) {
    const sym = await prisma.symbol.findUnique({ where: { ticker: pos.symbol } });
    if (!sym) continue;
    await prisma.position.upsert({
      where: { symbolId: sym.id },
      update: { qty: pos.quantity, sellableQty: pos.sellableQty, avgPrice: pos.avgPrice, syncedAt: new Date() },
      create: { symbolId: sym.id, qty: pos.quantity, sellableQty: pos.sellableQty, avgPrice: pos.avgPrice },
    });
  }
  return positions.length;
}

export { vnToday };
