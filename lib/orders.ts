import { prisma } from "./prisma";
import { ownerId } from "./user";
import { getBool } from "./settings";
import { placeOrder as tcbsPlace, tcbsConfigured } from "./tcbs/client";
import { sendTelegram } from "./telegram/notify";
import { px } from "./format";

export interface PlaceResult {
  ok: boolean;
  message: string;
  orderId?: number;
}

/** Đặt lệnh mua từ Signal — paper hoặc live qua TCBS. Mọi risk gate ở đây. */
export async function placeSignalOrder(signalId: number): Promise<PlaceResult> {
  if (await getBool("killSwitch")) return { ok: false, message: "🛑 kill switch ON" };

  const signal = await prisma.signal.findUnique({
    where: { id: signalId },
    include: { symbol: true },
  });
  if (!signal) return { ok: false, message: "signal không tồn tại" };
  if (["ordered", "filled", "skipped", "expired", "taken"].includes(signal.status)) {
    return { ok: false, message: `signal đã ở trạng thái ${signal.status}` };
  }

  const userId = await ownerId();
  const openCount = await prisma.trade.count({ where: { status: "open", userId } });
  const maxPos = Number(
    (await prisma.setting.findUnique({ where: { key: "maxPositions" } }))?.value ?? 5,
  );
  if (openCount >= maxPos) {
    return { ok: false, message: `đã đạt max positions (${maxPos})` };
  }

  const paper = await getBool("paperTrading");

  const order = await prisma.order.create({
    data: {
      signalId: signal.id,
      side: "BUY",
      qty: signal.qty,
      price: signal.entry,
      type: "LO",
      status: paper ? "filled" : "pending",
      mode: paper ? "paper" : "live",
      filledAt: paper ? new Date() : null,
    },
  });

  if (paper) {
    // Paper: fill ngay tại entry → mở Trade
    const trade = await prisma.trade.create({
      data: {
        userId,
        symbolId: signal.symbolId,
        qty: signal.qty,
        entryPrice: signal.entry,
        stopPrice: signal.stop,
        targetPrice: signal.target,
        signalId: signal.id,
        note: "paper",
      },
    });
    await prisma.order.update({ where: { id: order.id }, data: { tradeId: trade.id } });
    await prisma.signal.update({ where: { id: signal.id }, data: { status: "filled" } });
    return { ok: true, message: `📝 PAPER fill ${signal.symbol.ticker} ${signal.qty}cp @ ${px(signal.entry)}`, orderId: order.id };
  }

  if (!tcbsConfigured()) {
    return { ok: false, message: "chưa cấu hình TCBS_API_KEY/TCBS_ACCOUNT_NO" };
  }

  try {
    const r = await tcbsPlace({
      side: "NB",
      symbol: signal.symbol.ticker,
      priceType: "LO",
      price: signal.entry,
      quantity: signal.qty,
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { tcbsOrderId: r.orderId ? String(r.orderId) : null, status: "pending" },
    });
    await prisma.signal.update({ where: { id: signal.id }, data: { status: "ordered" } });
    await sendTelegram(
      `📤 Đã đặt LO mua <b>${signal.symbol.ticker}</b> ${signal.qty}cp @ ${px(signal.entry)} (order ${r.orderId ?? "?"})`,
    );
    return { ok: true, message: `đã gửi lệnh TCBS, id=${r.orderId ?? "?"}`, orderId: order.id };
  } catch (e) {
    await prisma.order.update({ where: { id: order.id }, data: { status: "rejected" } });
    return { ok: false, message: e instanceof Error ? e.message : "TCBS error" };
  }
}
