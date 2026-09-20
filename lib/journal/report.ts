import { prisma } from "../prisma";
import { sendTelegram } from "../telegram/notify";

/** Báo cáo tuần: P&L, win rate, adherence (theo tín hiệu + giữ stop). */
export async function weeklyReport(): Promise<string> {
  const since = new Date(Date.now() - 7 * 86400e3);
  const [closed, opened, openPos] = await Promise.all([
    prisma.trade.findMany({
      where: { status: "closed", closedAt: { gte: since } },
      include: { symbol: true, signal: { include: { strategy: true } } },
    }),
    prisma.trade.count({ where: { openedAt: { gte: since } } }),
    prisma.trade.findMany({ where: { status: "open" }, include: { symbol: true } }),
  ]);

  const pnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRate = closed.length ? ((wins / closed.length) * 100).toFixed(0) : "—";

  // Adherence: % trade gắn signal + thoát theo plan (stop/target/trailing/time-stop, không phải manual)
  const planned = closed.filter((t) => t.signalId);
  const planExits = planned.filter((t) =>
    ["stop", "target", "trailing-ma10", "close<ma50", "rsi-revert-exit", "time-stop"].includes(
      t.exitReason ?? "",
    ),
  );
  const adherence = planned.length
    ? ((planExits.length / planned.length) * 100).toFixed(0)
    : "—";

  const lines = [
    `📋 <b>Báo cáo tuần</b> (${since.toISOString().slice(0, 10)} → nay)`,
    `Đóng: ${closed.length} trades | P&L ${(pnl / 1e6).toFixed(2)}tr | win ${winRate}%`,
    `Mở mới: ${opened} | đang giữ: ${openPos.length} (${openPos.map((t) => t.symbol.ticker).join(", ") || "—"})`,
    `Adherence (theo signal + giữ plan): ${adherence}%`,
  ];
  if (closed.length) {
    const worst = [...closed].sort((a, b) => (a.pnl ?? 0) - (b.pnl ?? 0))[0];
    const best = [...closed].sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0))[0];
    lines.push(
      `Tệ nhất: ${worst.symbol.ticker} ${(worst.pnl! / 1e6).toFixed(2)}tr (${worst.exitReason ?? "?"})`,
      `Tốt nhất: ${best.symbol.ticker} +${(best.pnl! / 1e6).toFixed(2)}tr (${best.exitReason ?? "?"})`,
    );
  }
  const text = lines.join("\n");
  await sendTelegram(text);
  return text;
}
