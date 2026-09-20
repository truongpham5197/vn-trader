import { prisma } from "../prisma";
import { getBool } from "../settings";
import { getLatestPrice } from "../price";
import { getOrder, getPositions, placeOrder, tcbsConfigured } from "./client";
import { sendTelegram } from "../telegram/notify";
import { vnToday } from "../vn-time";

const FEE_SELL = 0.0015 + 0.001; // phí + thuế bán

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

  const openTrades = await prisma.trade.findMany({
    where: { status: "open", stopPrice: { not: null } },
    include: { symbol: true },
  });
  if (!openTrades.length && !(await prisma.order.count({ where: { status: "pending" } }))) return;

  // 1. Sync lệnh pending (live) → fill → mở Trade
  if (tcbsConfigured() && !(await getBool("paperTrading"))) {
    await syncPendingOrders();
  }

  // 2. Stop-loss + target alert
  for (const t of openTrades) {
    const price = await getLatestPrice(t.symbol.ticker);
    if (price === null) continue;

    const held = await sessionsHeld(t.symbolId, t.openedAt);
    const eligible = held >= 2; // T+2 — CP mới về tài khoản

    if (price <= (t.stopPrice ?? 0)) {
      if (!eligible) {
        await sendTelegram(
          `⚠️ <b>${t.symbol.ticker}</b> chạm stop ${t.stopPrice} nhưng chưa đủ T+2 (held ${held} phiên) — theo dõi tay!`,
        );
        continue;
      }
      await executeStop(t, price);
    } else if (t.targetPrice && price >= t.targetPrice) {
      await sendTelegram(
        `🎯 <b>${t.symbol.ticker}</b> chạm target ${t.targetPrice} (giá ${price}) — cân nhắc chốt`,
      );
      // tránh spam: chỉ notify 1 lần — mark qua note
      if (!t.note?.includes("target-hit")) {
        await prisma.trade.update({
          where: { id: t.id },
          data: { note: `${t.note ?? ""} target-hit`.trim() },
        });
      }
    }
  }
}

async function executeStop(
  t: { id: number; qty: number; symbolId: number; symbol: { ticker: string } },
  price: number,
): Promise<void> {
  const paper = await getBool("paperTrading");

  if (paper || !tcbsConfigured()) {
    // Paper: đóng trade ngay tại giá chạm stop
    const trade = await prisma.trade.findUnique({ where: { id: t.id } });
    if (!trade) return;
    const proceeds = price * t.qty * 1000 * (1 - FEE_SELL);
    const cost = trade.entryPrice * t.qty * 1000 * 1.0015;
    await prisma.trade.update({
      where: { id: t.id },
      data: {
        status: "closed",
        exitPrice: price,
        pnl: proceeds - cost,
        exitReason: "stop",
        closedAt: new Date(),
      },
    });
    await sendTelegram(
      `🛑 STOP <b>${t.symbol.ticker}</b> bán ${t.qty}cp @ ${price} — P&L ${((proceeds - cost) / 1e6).toFixed(2)}tr (paper)`,
    );
    return;
  }

  // Live: đặt NS/MP
  try {
    const r = await placeOrder({
      side: "NS",
      symbol: t.symbol.ticker,
      priceType: "MP",
      price: 0,
      quantity: t.qty,
    });
    await sendTelegram(
      `🛑 STOP <b>${t.symbol.ticker}</b> — đã bắn lệnh bán MP ${t.qty}cp (order ${r.orderId ?? "?"})`,
    );
  } catch (e) {
    await sendTelegram(
      `❌ STOP <b>${t.symbol.ticker}</b> đặt lệnh thất bại: ${e instanceof Error ? e.message : "?"}`,
    );
  }
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
        await sendTelegram(`✅ Lệnh ${o.side} ${o.qty}cp khớp @ ${od.price}`);
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
