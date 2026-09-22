import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { STRATEGIES } from "@/lib/strategy";
import RunForm from "./RunForm";

export const dynamic = "force-dynamic";

interface Metrics {
  totalReturnPct: number;
  cagrPct: number;
  trades: number;
  winRatePct: number;
  avgR: number;
  profitFactor: number;
  maxDrawdownPct: number;
  exposurePct: number;
  skippedNoCash: number;
  skippedNoFill: number;
}

export default async function BacktestPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run } = await searchParams;
  const runs = await prisma.backtestRun.findMany({
    orderBy: { id: "desc" },
    take: 50,
  });
  const selected = run ? await prisma.backtestRun.findUnique({ where: { id: Number(run) } }) : null;
  const metrics: Metrics | null = selected ? JSON.parse(selected.metrics) : null;
  const equity: { date: string; equity: number }[] = selected ? JSON.parse(selected.equity) : [];
  const trades = selected
    ? (JSON.parse(selected.trades) as {
        ticker: string;
        entryDate: string;
        exitDate?: string;
        qty: number;
        entry: number;
        exit?: number;
        pnl?: number;
        exitReason?: string;
        rMultiple?: number;
      }[])
    : [];

  return (
    <main className="mx-auto max-w-5xl p-6 text-sm">
      <Link href="/" className="text-accent hover:underline">
        ← dashboard
      </Link>
      <h1 className="my-4 text-xl font-bold">Backtest</h1>

      <RunForm strategies={Object.keys(STRATEGIES)} />

      <div className="mb-8">
        <h2 className="mb-2 font-semibold">Runs gần đây</h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="p-2">#</th>
              <th className="p-2">Strategy</th>
              <th className="p-2">Universe</th>
              <th className="p-2">Period</th>
              <th className="p-2 text-right">Return</th>
              <th className="p-2 text-right">MaxDD</th>
              <th className="p-2 text-right">WinRate</th>
              <th className="p-2 text-right">Trades</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const m = JSON.parse(r.metrics) as Metrics;
              return (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="p-2">
                    <Link href={`/backtest?run=${r.id}`} className="text-accent hover:underline">
                      #{r.id}
                    </Link>
                  </td>
                  <td className="p-2">{r.strategyType}</td>
                  <td className="p-2">{r.universe}</td>
                  <td className="p-2">
                    {r.periodStart} → {r.periodEnd}
                  </td>
                  <td
                    className={`p-2 text-right ${m.totalReturnPct >= 0 ? "text-gain" : "text-loss"}`}
                  >
                    {m.totalReturnPct.toFixed(1)}%
                  </td>
                  <td className="p-2 text-right text-loss">{m.maxDrawdownPct.toFixed(1)}%</td>
                  <td className="p-2 text-right">{m.winRatePct.toFixed(0)}%</td>
                  <td className="p-2 text-right">{m.trades}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && metrics && (
        <section>
          <h2 className="mb-2 font-semibold">
            Run #{selected.id} — {selected.strategyType} / {selected.universe} /{" "}
            {selected.periodStart} → {selected.periodEnd}
          </h2>

          <div className="mb-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Stat label="Total return" value={`${metrics.totalReturnPct.toFixed(1)}%`} />
            <Stat label="CAGR" value={`${metrics.cagrPct.toFixed(1)}%`} />
            <Stat label="Max drawdown" value={`${metrics.maxDrawdownPct.toFixed(1)}%`} />
            <Stat label="Win rate" value={`${metrics.winRatePct.toFixed(1)}%`} />
            <Stat label="Trades" value={metrics.trades} />
            <Stat label="Avg R" value={metrics.avgR.toFixed(2)} />
            <Stat
              label="Profit factor"
              value={metrics.profitFactor === Infinity ? "∞" : metrics.profitFactor.toFixed(2)}
            />
            <Stat label="Exposure" value={`${metrics.exposurePct.toFixed(0)}%`} />
          </div>

          <EquityCurve points={equity} />

          <h3 className="mb-2 mt-6 font-semibold">Trades ({trades.length})</h3>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-muted">
                  <th className="p-2">Mã</th>
                  <th className="p-2">Vào</th>
                  <th className="p-2">Ra</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-right">Entry</th>
                  <th className="p-2 text-right">Exit</th>
                  <th className="p-2 text-right">P&L</th>
                  <th className="p-2 text-right">R</th>
                  <th className="p-2">Lý do</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="p-2 font-bold">{t.ticker}</td>
                    <td className="p-2">{t.entryDate}</td>
                    <td className="p-2">{t.exitDate}</td>
                    <td className="p-2 text-right">{t.qty}</td>
                    <td className="p-2 text-right">{t.entry.toFixed(2)}</td>
                    <td className="p-2 text-right">{t.exit?.toFixed(2)}</td>
                    <td
                      className={`p-2 text-right ${(t.pnl ?? 0) >= 0 ? "text-gain" : "text-loss"}`}
                    >
                      {((t.pnl ?? 0) / 1e6).toFixed(2)}tr
                    </td>
                    <td className="p-2 text-right">{t.rMultiple?.toFixed(2)}</td>
                    <td className="p-2">{t.exitReason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-muted">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function EquityCurve({ points }: { points: { date: string; equity: number }[] }) {
  if (points.length < 2) return null;
  const w = 800;
  const h = 200;
  const min = Math.min(...points.map((p) => p.equity));
  const max = Math.max(...points.map((p) => p.equity));
  const span = max - min || 1;
  const d = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * w).toFixed(1)},${(
          h - ((p.equity - min) / span) * (h - 10) - 5
        ).toFixed(1)}`,
    )
    .join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const up = last.equity >= first.equity;
  return (
    <div className="card p-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <path d={d} fill="none" stroke={up ? "#34d399" : "#f87171"} strokeWidth="1.5" />
      </svg>
      <div className="flex justify-between text-xs text-muted">
        <span>
          {first.date} — {(first.equity / 1e6).toFixed(0)}tr
        </span>
        <span>
          {last.date} — {(last.equity / 1e6).toFixed(0)}tr
        </span>
      </div>
    </div>
  );
}
