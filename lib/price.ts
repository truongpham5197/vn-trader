import { fetchDailyBars } from "./data/dnse";
import { vnToday } from "./vn-time";

const cache = new Map<string, { price: number; at: number }>();
const TTL = 45_000;

/** Giá gần nhất trong phiên — dùng daily bar hình thành của DNSE (paper). */
export async function getLatestPrice(ticker: string): Promise<number | null> {
  const c = cache.get(ticker);
  if (c && Date.now() - c.at < TTL) return c.price;
  try {
    const today = vnToday();
    const bars = await fetchDailyBars(ticker, new Date(Date.now() - 5 * 86400e3), new Date());
    const last = bars[bars.length - 1];
    // bar hôm nay (đang hình thành) hoặc bar gần nhất
    const price = last?.date === today ? last.close : (last?.close ?? null);
    if (price !== null) cache.set(ticker, { price, at: Date.now() });
    return price ?? null;
  } catch {
    return null;
  }
}
