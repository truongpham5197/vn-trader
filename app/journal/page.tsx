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
    <main className="mx-auto max-w-5xl p-6 text-sm">
      <Link href="/" className="text-accent hover:underline">
        ← dashboard
      </Link>
      <h1 className="my-4 text-xl font-bold tracking-tight">Journal</h1>

      <div className="mb-6 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Đang giữ" value={open.length} />
        <Stat label="Đã đóng" value={closed.length} />
        <Stat
          label="Win rate"
          value={closed.length ? `${((wins / closed.length) * 100).toFixed(0)}%` : "—"}
        />
        <Stat
          label="P&L đóng"
          value={`${(totalPnl / 1e6).toFixed(2)}tr`}
          tone={totalPnl >= 0 ? "gain" : "loss"}
        />
        <Stat
          label="Theo tín hiệu"
          value={closed.length ? `${((withSignal / closed.length) * 100).toFixed(0)}%` : "—"}
        />
        <Stat
          label="Thoát theo plan"
          value={withSignal ? `${((planExit / withSignal) * 100).toFixed(0)}%` : "—"}
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="p-3 font-medium">Mã</th>
              <th className="p-3 font-medium">Strategy</th>
              <th className="p-3 text-right font-medium">Qty</th>
              <th className="p-3 text-right font-medium">Entry</th>
              <th className="p-3 text-right font-medium">Stop</th>
              <th className="p-3 text-right font-medium">Exit</th>
              <th className="p-3 text-right font-medium">P&L</th>
              <th className="p-3 font-medium">Lý do ra</th>
              <th className="p-3 font-medium">Mở</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr
                key={t.id}
                className="border-b border-border/50 last:border-0 hover:bg-white/[0.03]"
              >
                <td className="p-3 font-semibold">{t.symbol.ticker}</td>
                <td className="p-3 text-muted">
                  {t.signal?.strategy.name ?? (t.note === "manual" ? "tay" : "—")}
                </td>
                <td className="num p-3 text-right">{t.qty.toLocaleString("en-US")}</td>
                <td className="num p-3 text-right">{t.entryPrice.toFixed(2)}</td>
                <td className="num p-3 text-right text-loss">
                  {t.stopPrice?.toFixed(2) ?? "—"}
                </td>
                <td className="num p-3 text-right">{t.exitPrice?.toFixed(2) ?? "—"}</td>
                <td
                  className={`num p-3 text-right font-medium ${
                    t.pnl === null ? "" : t.pnl >= 0 ? "text-gain" : "text-loss"
                  }`}
                >
                  {t.pnl === null ? "—" : `${(t.pnl / 1e6).toFixed(2)}tr`}
                </td>
                <td className="p-3 text-muted">{t.exitReason ?? t.status}</td>
                <td className="num p-3 text-muted">{t.openedAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {trades.length === 0 && (
        <p className="card mt-4 p-4 text-muted">Chưa có trade nào.</p>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "gain" | "loss";
}) {
  return (
    <div className="card p-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div
        className={`num mt-1 font-semibold ${
          tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
