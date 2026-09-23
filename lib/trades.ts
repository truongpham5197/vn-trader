import { prisma } from "./prisma";
import { ownerId } from "./user";
import { netPnl } from "./fees";

export { netPnl };

/** Đóng trade mở — dùng chung /close Telegram + web. */
export async function closeTrade(id: number, exit: number, reason = "manual") {
  const t = await prisma.trade.findUnique({ where: { id }, include: { symbol: true } });
  if (!t || t.status !== "open") return null;
  const pnl = netPnl(t.entryPrice, exit, t.qty);
  await prisma.trade.update({
    where: { id },
    data: { status: "closed", exitPrice: exit, pnl, exitReason: reason, closedAt: new Date() },
  });
  return { ...t, exitPrice: exit, pnl, pnlPct: (pnl / (t.entryPrice * t.qty * 1000)) * 100 };
}

/**
 * Mở Trade theo signal để watcher canh stop. Idempotent theo user (bấm 2 lần / retry).
 * Chỉ owner đổi trạng thái signal (status dùng chung cho Telegram/scan).
 */
export async function takeSignal(id: number, o: { qty?: number; entry?: number; userId?: number } = {}) {
  const owner = await ownerId();
  const userId = o.userId ?? owner;
  const signal =
    userId === owner
      ? await prisma.signal.update({ where: { id }, data: { status: "taken" } })
      : await prisma.signal.findUniqueOrThrow({ where: { id } });
  const dup = await prisma.trade.findFirst({ where: { signalId: id, status: "open", userId } });
  if (dup) return dup;
  return prisma.trade.create({
    data: {
      userId,
      symbolId: signal.symbolId,
      qty: o.qty ?? signal.qty,
      entryPrice: o.entry ?? signal.entry,
      stopPrice: signal.stop,
      targetPrice: signal.target,
      signalId: id,
      note: "manual",
    },
  });
}

/** Danh sách theo dõi của 1 user (mặc định owner — Telegram). */
export async function getWatchlist(userId?: number): Promise<string[]> {
  const u = await prisma.user.findUnique({ where: { id: userId ?? (await ownerId()) }, select: { watchlist: true } });
  return u?.watchlist ?? [];
}

/** Mã theo dõi của mọi user — scan luôn quét (bỏ qua lọc universe) như mã đang giữ. */
export async function allWatchlists(): Promise<string[]> {
  const us = await prisma.user.findMany({ select: { watchlist: true } });
  return [...new Set(us.flatMap((u) => u.watchlist))];
}

export const setWatchlist = (userId: number, tickers: string[]) =>
  prisma.user.update({ where: { id: userId }, data: { watchlist: [...new Set(tickers)].sort() } });
