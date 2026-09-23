import { VN30 } from "../data/vn30";
import type { Bar } from "../data/types";

/** Snapshot thành viên hiện tại — không phải lịch sử rổ. */
export const VN30_TICKERS: string[] = [...VN30];

export const VN30_MEMBERSHIP_NOTE =
  "VN30 dùng danh sách thành viên hiện tại (HOSE review T1/T7), không phải lịch sử rổ — có thiên lệch sống sót.";

export const LIQUID_LOOKBACK = 20;

export type ValueBar = Bar & { value?: number };

function barValue(b: ValueBar): number {
  return b.value ?? b.close * b.volume * 1000;
}

/**
 * Thanh khoản as-of ngày `asOf`: trung bình GTGD `lookback` phiên có bars.date <= asOf.
 * Không dùng 20 phiên mới nhất của toàn series (tránh thiên lệch sống sót).
 */
export function tickerLiquidOnDate(
  bars: ValueBar[],
  asOf: string,
  minValue: number,
  lookback = LIQUID_LOOKBACK,
): boolean {
  const hist = bars.filter((b) => b.date <= asOf).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (hist.length < lookback) return false;
  const window = hist.slice(-lookback);
  const avg = window.reduce((s, b) => s + barValue(b), 0) / window.length;
  return avg >= minValue;
}

export function makeAsOfLiquidFilter(barsByTicker: Map<string, ValueBar[]>, minValue: number) {
  return (ticker: string, date: string) => {
    const bars = barsByTicker.get(ticker);
    if (!bars) return false;
    return tickerLiquidOnDate(bars, date, minValue);
  };
}
