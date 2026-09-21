import { fetchDailyBars, fetchMinuteBars } from "./data/dnse";
import { vnToday } from "./vn-time";

export interface Quote {
  last: number | null; // giá mới nhất (nến 1m trong phiên, fallback daily)
  open: number | null; // O/H/L phiên hôm nay (bar daily đang hình thành)
  high: number | null;
  low: number | null;
  ref: number | null; // giá tham chiếu = close phiên trước
}

const cache = new Map<string, { q: Quote; at: number }>();
const TTL = 30_000;

/**
 * Quote gần-realtime: last từ nến 1 phút DNSE (trễ ~1 phút),
 * OHLC từ daily bar đang hình thành, ref = close phiên trước.
 * Không phải tick-by-tick — đủ cho canh stop/% trên app giấy.
 */
export async function getQuote(ticker: string): Promise<Quote> {
  const c = cache.get(ticker);
  if (c && Date.now() - c.at < TTL) return c.q;

  const today = vnToday();
  let last: number | null = null;
  let open: number | null = null;
  let high: number | null = null;
  let low: number | null = null;
  let ref: number | null = null;

  try {
    const dayStart = new Date(`${today}T00:00:00+07:00`);
    const m1 = await fetchMinuteBars(ticker, dayStart, new Date());
    if (m1.length) last = m1[m1.length - 1].close;
  } catch {
    /* fallback daily */
  }

  try {
    const bars = await fetchDailyBars(ticker, new Date(Date.now() - 7 * 86400e3), new Date());
    const todayBar = bars.length && bars[bars.length - 1].date === today ? bars[bars.length - 1] : null;
    if (todayBar) {
      open = todayBar.open;
      high = todayBar.high;
      low = todayBar.low;
      ref = bars[bars.length - 2]?.close ?? null;
    } else {
      // Ngoài giờ / không có bar hôm nay → ref là close gần nhất
      ref = bars[bars.length - 1]?.close ?? null;
    }
    if (last === null) last = bars[bars.length - 1]?.close ?? null;
  } catch {
    /* chỉ có last từ 1m nếu daily lỗi */
  }

  const q: Quote = { last, open, high, low, ref };
  if (last !== null) cache.set(ticker, { q, at: Date.now() });
  return q;
}

export async function getLatestPrice(ticker: string): Promise<number | null> {
  return (await getQuote(ticker)).last;
}

/** "O 91.5 · H 92.0 · L 90.5 · TC 91.0 (+1.1%)" — dòng quote ngắn cho alert. */
export function formatQuoteLine(q: Quote): string {
  const chg =
    q.last !== null && q.ref
      ? ` · ${q.last >= q.ref ? "🟢" : "🔴"} ${q.last >= q.ref ? "+" : ""}${((q.last / q.ref - 1) * 100).toFixed(2)}% vs TC`
      : "";
  const parts = [
    q.open !== null ? `O ${q.open.toFixed(2)}` : null,
    q.high !== null ? `H ${q.high.toFixed(2)}` : null,
    q.low !== null ? `L ${q.low.toFixed(2)}` : null,
    q.ref !== null ? `TC ${q.ref.toFixed(2)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") + chg : "";
}
