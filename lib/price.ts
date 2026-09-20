import { fetchDailyBars, fetchMinuteBars } from "./data/dnse";
import { vnToday } from "./vn-time";

const cache = new Map<string, { price: number; at: number }>();
const TTL = 30_000;

/**
 * Giá gần nhất — ưu tiên nến 1 phút của phiên hôm nay (gần realtime, trễ ~1 phút
 * do DNSE aggregate), fallback daily bar gần nhất ngoài giờ / khi lỗi.
 */
export async function getLatestPrice(ticker: string): Promise<number | null> {
  const c = cache.get(ticker);
  if (c && Date.now() - c.at < TTL) return c.price;

  const today = vnToday();
  let price: number | null = null;
  try {
    // Nến 1m hôm nay — trong giờ phiên trả về giá gần nhất
    const dayStart = new Date(`${today}T00:00:00+07:00`);
    const m1 = await fetchMinuteBars(ticker, dayStart, new Date());
    if (m1.length) price = m1[m1.length - 1].close;
  } catch {
    /* fallback daily */
  }
  if (price === null) {
    try {
      const bars = await fetchDailyBars(ticker, new Date(Date.now() - 5 * 86400e3), new Date());
      price = bars[bars.length - 1]?.close ?? null;
    } catch {
      return null;
    }
  }
  if (price !== null) cache.set(ticker, { price, at: Date.now() });
  return price;
}
