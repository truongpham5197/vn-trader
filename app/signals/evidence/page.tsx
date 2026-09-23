import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/user";
import { redirect } from "next/navigation";
import {
  LIMITATIONS,
  computeSignalEvidence,
  evidenceQueryWindow,
  plainEvidenceVerdict,
  type BarClose,
  type SignalSnapshot,
} from "@/lib/report/signal-evidence";

export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);
const STATUS: Record<string, string> = {
  new: "mới",
  notified: "chờ xử lý",
  taken: "đã mua",
  filled: "đã khớp",
  ordered: "đã đặt",
  skipped: "bỏ qua",
  expired: "hết hạn",
};

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
  const verdict = plainEvidenceVerdict(r);
  const saved = Object.entries(r.statusCounts).map(([k, n]) => `${STATUS[k] ?? k} ${n}`).join(" · ");
  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl p-4 text-sm sm:p-6">
      <h1 className="text-xl font-bold tracking-tight">Sau khi báo mua, giá đi đâu?</h1>
      <p className="mt-1 mb-4 max-w-2xl text-xs text-muted">
        Nhìn lại tín hiệu app đã báo trong 90 ngày. So giá đóng cửa sau 5, 10 và 20 phiên với giá ghi trên tín hiệu.
        Không phải tiền bạn lãi hay lỗ — bạn có thể chưa mua.
      </p>
      <div className="card mb-4 p-4">
        <p className="font-semibold">{verdict.title}</p>
        <p className="mt-1 text-sm">{verdict.line}</p>
        <p className="mt-2 text-xs text-muted">Giá cao hơn lúc báo không có nghĩa bạn đã lãi. Chưa trừ phí, và không phải lệnh đã khớp.</p>
      </div>
      <p className="mb-4 text-xs text-muted">
        Muốn biết giả lập mua–bán theo luật có lãi không? Đó là{" "}
        <Link href="/backtest" className="text-accent hover:underline">Giả lập mua bán</Link>
        {" "}— trang này không làm việc đó, và không tự sửa luật.
      </p>
      <div className="card mb-4 overflow-x-auto p-3">
        <table className="num w-full text-xs">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1 pr-3">Sau bao lâu</th>
              <th className="pr-3">Đã có giá</th>
              <th className="pr-3">Chưa đủ ngày</th>
              <th className="pr-3">Thiếu giá</th>
              <th className="pr-3">Giá TB so với lúc báo</th>
              <th>Số mã giá cao hơn</th>
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
                <td>{h.positiveDenom ? `${h.positiveCount}/${h.positiveDenom}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer text-foreground">Vì sao số này chưa đủ để tin</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {LIMITATIONS.map((x) => <li key={x}>{x}</li>)}
        </ul>
        <p className="mt-2">{saved ? `Đã lưu: ${saved}.` : "Chưa có tín hiệu."}{r.rejected > 0 ? ` Bỏ ${r.rejected} bản ghi hỏng.` : ""}</p>
        {r.groups.length > 0 && (
          <table className="num mt-3 w-full">
            <thead>
              <tr className="text-left">
                <th className="py-1 pr-3">Ngày báo</th>
                <th className="pr-3">Luật</th>
                <th className="pr-3">Số mã</th>
                <th>Sau 5 phiên</th>
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
                    <td>{h5 ? `${h5.mature} mã · TB ${pct(h5.mean)}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </details>
    </main>
  );
}
