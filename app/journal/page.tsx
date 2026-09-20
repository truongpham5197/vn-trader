import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const trades = await prisma.trade.findMany({
    include: { symbol: true, signal: { include: { strategy: true } } },
    orderBy: { id: "desc" },
    take: 200,
  });

  const closed = trades.filter((t) => t.status === "closed");
  const open = trades.filter((t) => t.status === "open");
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const withSignal = closed.filter((t) => t.signalId).length;
  const planExit = closed.filter((t) =>
    ["stop", "target", "trailing-ma10", "close<ma50", "rsi-revert-exit", "time-stop"].includes(
      t.exitReason ?? "",
    ),
  ).length;

  return (
    <main className="mx-auto max-w-5xl p-6 font-mono text-sm">
      <Link href="/" className="text-blue-400 underline">
        ← dashboard
      </Link>
      <h1 className="my-4 text-xl font-bold">Journal</h1>

      <div className="mb-6 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Stat label="Đang giữ" value={open.length} />
        <Stat label="Đã đóng" value={closed.length} />
        <Stat
          label="Win rate"
          value={closed.length ? `${((wins / closed.length) * 100).toFixed(0)}%` : "—"}
        />
        <Stat label="P&L đóng" value={`${(totalPnl / 1e6).toFixed(2)}tr`} />
        <Stat
          label="Theo tín hiệu"
          value={closed.length ? `${((withSignal / closed.length) * 100).toFixed(0)}%` : "—"}
        />
        <Stat
          label="Thoát theo plan"
          value={withSignal ? `${((planExit / withSignal) * 100).toFixed(0)}%` : "—"}
        />
      </div>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-neutral-800 text-left text-neutral-500">
            <th className="p-2">Mã</th>
            <th className="p-2">Strategy</th>
            <th className="p-2 text-right">Qty</th>
            <th className="p-2 text-right">Entry</th>
            <th className="p-2 text-right">Stop</th>
            <th className="p-2 text-right">Exit</th>
            <th className="p-2 text-right">P&L</th>
            <th className="p-2">Lý do ra</th>
            <th className="p-2">Mở</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} className="border-b border-neutral-900">
              <td className="p-2 font-bold">{t.symbol.ticker}</td>
              <td className="p-2">{t.signal?.strategy.name ?? (t.note === "manual" ? "tay" : "—")}</td>
              <td className="p-2 text-right">{t.qty}</td>
              <td className="p-2 text-right">{t.entryPrice.toFixed(2)}</td>
              <td className="p-2 text-right text-red-400">{t.stopPrice?.toFixed(2) ?? "—"}</td>
              <td className="p-2 text-right">{t.exitPrice?.toFixed(2) ?? "—"}</td>
              <td
                className={`p-2 text-right ${
                  t.pnl === null ? "" : t.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {t.pnl === null ? "—" : `${(t.pnl / 1e6).toFixed(2)}tr`}
              </td>
              <td className="p-2">{t.exitReason ?? t.status}</td>
              <td className="p-2 text-neutral-500">{t.openedAt.toISOString().slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {trades.length === 0 && <p className="text-neutral-500">Chưa có trade nào.</p>}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-neutral-800 p-2">
      <div className="text-[10px] text-neutral-500">{label}</div>
      <div>{value}</div>
    </div>
  );
}
