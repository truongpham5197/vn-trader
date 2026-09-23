import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/user";
import { redirect } from "next/navigation";
import {
  LIMITATIONS,
  computeSignalEvidence,
  evidenceQueryWindow,
  type BarClose,
  type SignalSnapshot,
} from "@/lib/report/signal-evidence";

export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

/** Hồi cố toàn bộ tín hiệu đã lưu — không phải PnL khớp lệnh, không phải xác suất thắng. */
export default async function SignalEvidencePage() {
  const u = await currentUser();
  if (!u?.owner) redirect("/signals");
  const now = new Date();
  const win = evidenceQueryWindow(now);
  const signals = await prisma.signal.findMany({
    where: { date: { gte: win.from, lte: win.today } },
    include: { symbol: { select: { ticker: true } }, strategy: { select: { type: true } } },
    orderBy: { date: "asc" },
  });
  const tickers = [...new Set(signals.map((s) => s.symbol.ticker))];
  const bars = tickers.length
    ? await prisma.dailyBar.findMany({
        where: { date: { gte: win.from, lte: win.barTo }, symbol: { ticker: { in: tickers } } },
        select: { date: true, close: true, symbol: { select: { ticker: true } } },
      })
    : [];
  const calendar = (
    await prisma.dailyBar.findMany({
      where: { date: { gte: win.from, lte: win.barTo } },
      distinct: ["date"],
      select: { date: true },
      orderBy: { date: "asc" },
    })
  ).map((d) => d.date);
  const snaps: SignalSnapshot[] = signals.map((s) => ({
    id: s.id,
    strategy: s.strategy.type,
    ticker: s.symbol.ticker,
    date: s.date,
    entry: s.entry,
    status: s.status,
    createdAt: s.createdAt,
  }));
  const closes: BarClose[] = bars.map((b) => ({ ticker: b.symbol.ticker, date: b.date, close: b.close }));
  const r = computeSignalEvidence({ signals: snaps, bars: closes, calendar, now });
  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl p-4 text-sm sm:p-6">
      <h1 className="text-xl font-bold tracking-tight">Bằng chứng tín hiệu</h1>
      <p className="mt-1 mb-3 text-xs text-muted">
        Hồi cố {r.analyzed} tín hiệu đã lưu từ {r.periodStart} đến {r.periodEnd}. So sánh giá đóng cửa sau 5/10/20 phiên với giá ghi trên tín hiệu.
        Không phải lãi/lỗ khớp lệnh, không phải xác suất thắng, không dùng để kết luận chiến lược có edge.
      </p>
      <ul className="mb-4 list-disc space-y-0.5 pl-4 text-xs text-muted">
        {LIMITATIONS.map((x) => <li key={x}>{x}</li>)}
      </ul>
      <div className="card mb-4 overflow-x-auto p-3">
        <table className="num w-full text-xs">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1 pr-3">Cửa sổ</th>
              <th className="pr-3">Đủ dữ liệu</th>
              <th className="pr-3">Chưa đủ phiên</th>
              <th className="pr-3">Thiếu nến</th>
              <th className="pr-3">Trung bình</th>
              <th className="pr-3">Trung vị</th>
              <th>Close &gt; entry</th>
            </tr>
          </thead>
          <tbody>
            {r.horizons.map((h) => (
              <tr key={h.sessions} className="border-t border-border/60">
                <td className="py-1 pr-3">{h.sessions} phiên</td>
                <td className="pr-3">{h.mature}</td>
                <td className="pr-3">{h.pending}</td>
                <td className="pr-3">{h.missingData}</td>
                <td className="pr-3">{pct(h.mean)}</td>
                <td className="pr-3">{pct(h.median)}</td>
                <td>{h.positiveCount}/{h.positiveDenom} ({pct(h.positiveFraction)}){h.sampleWarning ? ` · ${h.sampleWarning}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mb-2 text-xs text-muted">
        Trạng thái lưu: {Object.entries(r.statusCounts).map(([k, n]) => `${k} ${n}`).join(" · ") || "không có"}
        {r.rejected > 0 ? ` · loại ${r.rejected} bản ghi không hợp lệ` : ""}
      </p>
      <div className="card overflow-x-auto p-3">
        <table className="num w-full text-xs">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1 pr-3">Ngày</th>
              <th className="pr-3">Chiến lược</th>
              <th className="pr-3">Số tín hiệu</th>
              <th>5 phiên (đủ / TB)</th>
            </tr>
          </thead>
          <tbody>
            {r.groups.map((g) => {
              const h5 = g.horizons.find((h) => h.sessions === 5);
              return (
                <tr key={`${g.date}-${g.strategy}`} className="border-t border-border/60">
                  <td className="py-1 pr-3">{g.date}</td>
                  <td className="pr-3">{g.strategy}</td>
                  <td className="pr-3">{g.n}</td>
                  <td>{h5 ? `${h5.mature} · ${pct(h5.mean)}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
