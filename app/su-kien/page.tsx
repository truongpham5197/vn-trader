import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { LivePrice, PinQuotes } from "../components/live";
import EventsBoard from "../components/EventsBoard";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sự kiện & chứng chỉ quỹ — vn-trader" };

const sg = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
const tone = (v: number | null) => (v === null ? "" : v >= 0 ? "text-gain" : "text-loss");
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);

/** Bảng giá chứng chỉ quỹ (ETF + quỹ đóng IFC) — sort theo GTGD 20 phiên. */
async function FundRows() {
  const funds = await prisma.symbol.findMany({
    where: { kind: "fund", active: true },
    orderBy: { ticker: "asc" },
  });
  const since = daysAgo(45);
  const bars = funds.length
    ? await prisma.dailyBar.findMany({
        where: { symbolId: { in: funds.map((f) => f.id) }, date: { gte: since } },
        orderBy: { date: "asc" },
        select: { symbolId: true, close: true, value: true },
      })
    : [];
  const byId = new Map<number, { close: number; value: number }[]>();
  for (const b of bars) {
    const a = byId.get(b.symbolId) ?? [];
    a.push(b);
    byId.set(b.symbolId, a);
  }
  const rows = funds
    .map((f) => {
      const bs = byId.get(f.id) ?? [];
      const last = bs.at(-1)?.close ?? null;
      const ret = (k: number) => (last === null || bs.length <= k ? null : (last / bs[bs.length - 1 - k].close - 1) * 100);
      return { ...f, last, prev: bs.at(-2)?.close ?? null, w: ret(5), m: ret(20), v20: avg(bs.slice(-20).map((b) => b.value)) };
    })
    .sort((a, b) => b.v20 - a.v20);
  return (
    <>
    <PinQuotes tickers={rows.map((f) => f.ticker)} />
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="border-b border-border text-left text-muted">
          <th className="py-1 pr-3 font-medium">Mã</th>
          <th className="min-w-40 pr-3 font-medium">Quỹ</th>
          <th className="pr-3 font-medium text-right" colSpan={2}>Giá (%)</th>
          <th className="pr-3 font-medium text-right">1 tuần</th>
          <th className="pr-3 font-medium text-right">1 tháng</th>
          <th className="font-medium text-right">GTGD TB20</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((f) => (
          <tr key={f.ticker} className="border-b border-border/50 last:border-0 hover:bg-white/[0.03]">
            <td className="py-1.5 pr-3 font-semibold">
              <Link href={`/stock/${f.ticker}`} className="hover:text-accent">
                {f.ticker}
              </Link>
            </td>
            <td className="max-w-56 truncate py-1.5 pr-3 text-muted">{f.companyName ?? "—"}</td>
            <td className="py-1.5 pr-3 text-right" colSpan={2}>
              <LivePrice ticker={f.ticker} fallback={f.last} refPrice={f.prev} />
            </td>
            <td className={`num py-1.5 pr-3 text-right ${tone(f.w)}`}>{sg(f.w)}</td>
            <td className={`num py-1.5 pr-3 text-right ${tone(f.m)}`}>{sg(f.m)}</td>
            <td className="num py-1.5 text-right text-muted">{(f.v20 / 1e9).toFixed(1)} tỷ</td>
          </tr>
        ))}
      </tbody>
    </table>
    </>
  );
}

export default async function EventsPage() {
  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl space-y-5 p-4 text-sm sm:p-6">
      <h1 className="text-xl font-bold tracking-tight">📅 Sự kiện &amp; chứng chỉ quỹ</h1>

      <EventsBoard />

      <section className="card overflow-x-auto p-4">
        <h2 className="mb-1 font-semibold">📊 Chứng chỉ quỹ (ETF, quỹ đóng)</h2>
        <p className="mb-3 text-xs text-muted">
          Giá khớp gần realtime như cổ phiếu — bấm vào mã để xem đồ thị, tin và sự kiện riêng của quỹ.
        </p>
        <FundRows />
      </section>
    </main>
  );
}
