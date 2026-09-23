import { prisma } from "./prisma";
import { getSetting, setSetting } from "./settings";
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

/** Đánh dấu signal đã mua + mở Trade để watcher canh stop. Idempotent (bấm 2 lần / retry). */
export async function takeSignal(id: number, o?: { qty?: number; entry?: number }) {
  const signal = await prisma.signal.update({ where: { id }, data: { status: "taken" } });
  const dup = await prisma.trade.findFirst({ where: { signalId: id, status: "open" } });
  if (dup) return dup;
  return prisma.trade.create({
    data: {
      symbolId: signal.symbolId,
      qty: o?.qty ?? signal.qty,
      entryPrice: o?.entry ?? signal.entry,
      stopPrice: signal.stop,
      targetPrice: signal.target,
      signalId: id,
      note: "manual",
    },
  });
}

/** Danh sách theo dõi riêng — luôn được scan (bỏ qua lọc universe) như mã đang giữ. */
export async function getWatchlist(): Promise<string[]> {
  try {
    const v = JSON.parse((await getSetting("watchlist")) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export const setWatchlist = (tickers: string[]) =>
  setSetting("watchlist", JSON.stringify([...new Set(tickers)].sort()));
