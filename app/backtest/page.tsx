import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { STRATEGIES } from "@/lib/strategy";
import RunForm from "./RunForm";
import {
  BACKTEST_LIMITATIONS,
  ENGINE_VERSION,
  isLegacyRun,
  parseStoredCfg,
} from "@/lib/backtest/report";
import { plainBacktestVerdict } from "@/lib/backtest/plain";

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
  closedTrades?: number;
  openTrades?: number;
  expectancyNet?: number;
  openMtmPnl?: number;
  benchmarkReturnPct?: number;
  oosReturnPct?: number;
  oosTrades?: number;
  oosExpectancyNet?: number;
  engineVersion?: number;
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
  const legacy = selected ? isLegacyRun(metrics, selected.params) : false;
  const cfg = selected ? parseStoredCfg(selected.params) : null;
  const focus = selected ?? runs[0] ?? null;
  const focusMetrics: Metrics | null = focus ? JSON.parse(focus.metrics) : null;
  const verdict = focus && focusMetrics
    ? plainBacktestVerdict(focusMetrics, focus.strategyType, isLegacyRun(focusMetrics, focus.params))
    : null;

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl p-4 text-sm sm:p-6">
      <h1 className="text-xl font-bold">Thử quá khứ</h1>
      <p className="mt-1 mb-4 max-w-2xl text-xs text-muted">
        Giả lập mua bán theo luật trên dữ liệu cũ, có phí. Không tự chạy khi mở trang, và không tự sửa luật —
        chỉnh cho vừa quá khứ dễ làm lần sau tệ hơn. Khác với mục Sau tín hiệu: trang kia chỉ xem giá đi đâu sau khi app đã báo.
      </p>
      {verdict ? (
        <div className={`card mb-4 p-4 ${verdict.tone === "loss" ? "border-loss/40" : ""}`}>
          <p>{verdict.line}</p>
          {focus && !selected && (
            <Link href={`/backtest?run=${focus.id}`} className="mt-2 inline-block text-xs text-accent hover:underline">
              Xem từng lệnh của lần chạy gần nhất →
            </Link>
          )}
        </div>
      ) : (
        <p className="card mb-4 p-4 text-xs text-muted">Chưa có lần chạy nào. Bấm nút bên dưới khi muốn xem — mỗi lần chạy khá nặng.</p>
      )}

      <RunForm strategies={Object.keys(STRATEGIES)} />

      <Limitations />

      <div className="mb-8">
        <h2 className="mb-2 font-semibold">Các lần đã chạy</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="p-2">#</th>
                <th className="p-2">Luật</th>
                <th className="p-2">Nhóm mã</th>
                <th className="p-2">Khoảng</th>
                <th className="p-2 text-right">Lãi/lỗ</th>
                <th className="p-2 text-right">Lúc tệ nhất</th>
                <th className="p-2 text-right">Lệnh lãi</th>
                <th className="p-2 text-right">Số lệnh</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const m = JSON.parse(r.metrics) as Metrics;
                const old = isLegacyRun(m, r.params);
                return (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="p-2">
                      <Link href={`/backtest?run=${r.id}`} className="text-accent hover:underline">
                        #{r.id}
                      </Link>
                      {old && <span className="ml-1 text-loss">cũ</span>}
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
      </div>

      {selected && metrics && (
        <section>
          <h2 className="mb-2 font-semibold">
            Run #{selected.id} — {selected.strategyType} / {selected.universe} /{" "}
            {selected.periodStart} → {selected.periodEnd}
          </h2>

          {legacy && (
            <p className="mb-3 rounded border border-loss/40 bg-loss/10 p-3 text-xs text-loss">
              Run này tạo trước engine v{ENGINE_VERSION} (T+2/equity/lệnh LO/universe as-of). Số
              liệu không đáng tin — hãy chạy lại với engine hiện tại.
            </p>
          )}

          {cfg && (
            <p className="mb-3 text-xs text-muted">
              cfg: NAV {(cfg.navVnd / 1e6).toFixed(0)}tr · risk {(cfg.riskPct * 100).toFixed(2)}% ·
              max {cfg.maxPositions} lệnh · phí mua {(cfg.buyFeePct * 100).toFixed(2)}% / bán{" "}
              {((cfg.sellFeePct + cfg.sellTaxPct) * 100).toFixed(2)}% · slip{" "}
              {(cfg.slippagePct * 100).toFixed(2)}% · T+{cfg.settleDays} · engine v
              {cfg.engineVersion}
            </p>
          )}

          <div className="mb-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Stat label="Lãi/lỗ cả kỳ" value={`${metrics.totalReturnPct.toFixed(1)}%`} />
            <Stat label="Lãi/năm" value={`${metrics.cagrPct.toFixed(1)}%`} />
            <Stat label="Lúc tệ nhất tụt" value={`${metrics.maxDrawdownPct.toFixed(1)}%`} />
            <Stat label="Tỷ lệ lệnh lãi" value={`${metrics.winRatePct.toFixed(1)}%`} />
            <Stat
              label="Lệnh đóng / mở"
              value={`${metrics.closedTrades ?? metrics.trades} / ${metrics.openTrades ?? 0}`}
            />
            <Stat label="Avg R (đóng)" value={metrics.avgR.toFixed(2)} />
            <Stat
              label="Profit factor"
              value={metrics.profitFactor === Infinity ? "∞" : metrics.profitFactor.toFixed(2)}
            />
            <Stat label="Exposure" value={`${metrics.exposurePct.toFixed(0)}%`} />
            <Stat
              label="Expectancy net"
              value={
                metrics.expectancyNet == null
                  ? "—"
                  : `${(metrics.expectancyNet / 1e6).toFixed(2)}tr/lệnh`
              }
            />
            <Stat
              label="Buy-hold EW (cùng phí)"
              value={
                metrics.benchmarkReturnPct == null
                  ? "—"
                  : `${metrics.benchmarkReturnPct.toFixed(1)}%`
              }
            />
            <Stat
              label="OOS return (30% cuối)"
              value={metrics.oosReturnPct == null ? "—" : `${metrics.oosReturnPct.toFixed(1)}%`}
            />
            <Stat
              label="OOS expectancy"
              value={
                metrics.oosExpectancyNet == null
                  ? "—"
                  : `${(metrics.oosExpectancyNet / 1e6).toFixed(2)}tr`
              }
            />
          </div>

          <EquityCurve points={equity} />

          <h3 className="mb-2 mt-6 font-semibold">
            Trades ({trades.length}
            {metrics.openTrades ? ` · ${metrics.openTrades} mở` : ""})
          </h3>
          <div className="max-h-96 overflow-auto">
            <div className="overflow-x-auto">
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
                      <td className="p-2">{t.exitDate ?? "—"}</td>
                      <td className="p-2 text-right">{t.qty}</td>
                      <td className="p-2 text-right">{t.entry.toFixed(2)}</td>
                      <td className="p-2 text-right">{t.exit?.toFixed(2) ?? "—"}</td>
                      <td
                        className={`p-2 text-right ${(t.pnl ?? 0) >= 0 ? "text-gain" : "text-loss"}`}
                      >
                        {t.pnl == null ? "—" : `${(t.pnl / 1e6).toFixed(2)}tr`}
                      </td>
                      <td className="p-2 text-right">{t.rMultiple?.toFixed(2) ?? "—"}</td>
                      <td className="p-2">{t.exitReason === "open" ? "đang mở" : t.exitReason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function Limitations() {
  return (
    <details className="mb-6 text-xs text-muted">
      <summary className="cursor-pointer font-medium text-foreground">
        Giới hạn — đọc trước khi tin số
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {BACKTEST_LIMITATIONS.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </details>
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
