import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  LIMITATIONS,
  computeSignalEvidence,
  evidenceQueryWindow,
  plainEvidenceVerdict,
  type BarClose,
  type SignalSnapshot,
} from "@/lib/report/signal-evidence";
import { RECORD_DAYS, strategyRecords } from "@/lib/report/accountability";
import { FILL_SESSIONS, MIN_RECORD, losingRecord } from "@/lib/report/signal-outcome";
import { strategyLabel } from "@/lib/strategy/labels";

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
  const records = await strategyRecords(win.today);
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
      <div className="card mb-4 p-4">
        <p className="font-semibold">Bảng điểm gợi ý mua ({RECORD_DAYS} ngày) — app tự chấm, đúng sai đều hiện</p>
        <p className="mt-1 text-xs text-muted">
          Mỗi gợi ý được chơi thử đúng kế hoạch đã gửi: khớp nếu giá về vùng mua trong {FILL_SESSIONS} phiên, bán sớm nhất T+2, chạm cắt lỗ/chốt lời hoặc hết số phiên giữ. Có trừ phí và thuế.
          Mô phỏng trên nến ngày, không phải lệnh khớp thật, không hứa kết quả kỳ sau. Chiến lược đang thua (đủ {MIN_RECORD} gợi ý, trung bình âm) bị gỡ khỏi gợi ý riêng từng người.
        </p>
        <div className="overflow-x-auto">
          <table className="num mt-2 w-full text-xs">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1 pr-3">Chiến lược</th>
                <th className="pr-3">Đã chấm</th>
                <th className="pr-3">Chạm chốt</th>
                <th className="pr-3">Thủng cắt lỗ</th>
                <th className="pr-3">Hết giờ</th>
                <th className="pr-3">Không khớp</th>
                <th className="pr-3">TB/lệnh</th>
                <th>Nhận xét</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(records).map(([t, s]) => (
                <tr key={t} className="border-t border-border/60">
                  <td className="py-1 pr-3">{strategyLabel(t)}</td>
                  <td className="pr-3">{s.resolved}</td>
                  <td className="pr-3 text-gain">{s.wins}</td>
                  <td className="pr-3 text-loss">{s.losses}</td>
                  <td className="pr-3">{s.timeouts}</td>
                  <td className="pr-3">{s.missed}</td>
                  <td className={`pr-3 ${(s.avgPct ?? 0) >= 0 ? "text-gain" : "text-loss"}`}>{s.avgPct === null ? "—" : `${s.avgPct >= 0 ? "+" : ""}${s.avgPct.toFixed(1)}%`}</td>
                  <td>{s.resolved < MIN_RECORD ? `mẫu ${s.resolved} < ${MIN_RECORD}, chưa kết luận` : losingRecord(s) ? "đang thua — chỉ để xem" : "chưa thua"}</td>
                </tr>
              ))}
              {!Object.keys(records).length && (
                <tr>
                  <td colSpan={8} className="py-2 text-muted">Chưa có gợi ý nào đủ phiên để chấm.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
