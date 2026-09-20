import { prisma } from "../prisma";
import { atr, sma } from "../strategy/indicators";
import { floorTick } from "../strategy/breakout20";
import type { Bar } from "../data/types";

export interface Suggestion {
  stop: number;
  target: number;
  rr: number;
  atr: number;
  swingLow: number;
  note: string;
}

/**
 * Gợi ý stop/target cho vị thế đang giữ, hướng tới targetPct% lãi.
 * Stop = sâu hơn trong 2 mức: swing low 10 phiên (hỗ trợ) và entry − 2×ATR14.
 * Nếu stop quá xa khiến R:R < 1 thì tighten về entry − 1.5×ATR và cảnh báo.
 */
export function suggestStopTarget(
  bars: Bar[],
  entry: number,
  targetPct = 5,
): Suggestion | null {
  if (bars.length < 20) return null;
  const a = atr(bars, 14) ?? 0;
  const swingLow = Math.min(...bars.slice(-10).map((b) => b.low));
  const tick = entry < 10 ? 0.05 : entry < 50 ? 0.1 : 0.5;

  let stop = floorTick(Math.min(swingLow - tick, entry - 2 * a));
  const target = floorTick(entry * (1 + targetPct / 100));
  if (stop <= 0 || stop >= entry) stop = floorTick(entry - 1.5 * a);
  if (stop <= 0 || stop >= entry) return null;

  const rr = (target - entry) / (entry - stop);
  let note = `ATR ${a.toFixed(2)} | swing low 10phiên ${swingLow}`;
  if (rr < 1) {
    stop = floorTick(entry - 1.5 * a);
    if (stop >= entry) return null;
    const rr2 = (target - entry) / (entry - stop);
    note += ` | stop nới theo cấu trúc cho R:R ${rr.toFixed(1)} xấu → tighten còn 1.5×ATR (R:R ${rr2.toFixed(1)})`;
    return { stop, target, rr: rr2, atr: a, swingLow, note };
  }
  return { stop, target, rr, atr: a, swingLow, note };
}

/** Gợi ý cho trade đang mở theo ticker — lấy bars từ DB. */
export async function suggestForTrade(
  tradeId: number,
  targetPct = 5,
): Promise<(Suggestion & { ticker: string; entry: number }) | null> {
  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: { symbol: true },
  });
  if (!trade) return null;
  const rows = await prisma.dailyBar.findMany({
    where: { symbolId: trade.symbolId },
    orderBy: { date: "desc" },
    take: 60,
  });
  const bars: Bar[] = rows.reverse().map((r) => ({
    date: r.date,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
  }));
  const s = suggestStopTarget(bars, trade.entryPrice, targetPct);
  if (!s) return null;
  return { ...s, ticker: trade.symbol.ticker, entry: trade.entryPrice };
}

export { sma };
