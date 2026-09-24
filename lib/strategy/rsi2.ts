import type { ExitCheckFn, StrategyFn } from "./types";
import { rsi, sma } from "./indicators";
import { buyZoneAboveStop, floorTick, realizedRr } from "./breakout20";

export const RSI2_DEFAULTS = {
  rsiPeriod: 2,
  rsiBuyBelow: 5,
  rsiSellAbove: 70,
  trendMa: 50,
  stopPct: 4,
  timeStopDays: 5,
  rrTarget: 1.5,
};

export function rsi2RequiredBars(params: Record<string, number> = {}): number {
  const p = { ...RSI2_DEFAULTS, ...params };
  return p.trendMa + 10;
}

/**
 * RSI(2) mean-reversion: uptrend (close > MA50) + RSI2 < rsiBuyBelow → mua
 * nhịp điều chỉnh ngắn. Stop = entry × (1 − stopPct%); exit RSI>70 hoặc
 * time-stop 5 phiên.
 */
export const rsi2Revert: StrategyFn = ({ bars, params, bandPct }) => {
  const p = { ...RSI2_DEFAULTS, ...params };
  const n = bars.length;
  if (n < rsi2RequiredBars(p)) return null;

  const closes = bars.map((b) => b.close);
  const last = bars[n - 1];
  const prev = bars[n - 2];

  const maSlow = sma(closes, p.trendMa);
  if (maSlow === null || last.close <= maSlow) return null;

  const r = rsi(closes, p.rsiPeriod);
  if (r === null || r >= p.rsiBuyBelow) return null;

  const ceiling = prev.close * (1 + bandPct);
  if (last.close >= ceiling - 1e-9) return null;

  const entry = last.close;
  const stop = floorTick(entry * (1 - p.stopPct / 100));
  if (stop <= 0 || stop >= entry) return null;
  const target = floorTick(entry + p.rrTarget * (entry - stop));
  if (target <= entry) return null;
  const rr = realizedRr(entry, stop, target);
  if (rr <= 0) return null;

  return {
    entry,
    stop,
    target,
    rr,
    reason: `Xu hướng dài vẫn tăng (giá > MA${p.trendMa}) nhưng vừa giảm mạnh ngắn hạn (RSI2 = ${r.toFixed(1)} < ${p.rsiBuyBelow}, quá bán) — có thể hồi kỹ thuật, không phải khuyến nghị chắc chắn`,
    plan: `SL = vào − ${p.stopPct}% = ${stop}; TP = vào + ${p.rrTarget}×rủi ro = ${target.toFixed(2)}. Kỳ vọng 1–${p.timeStopDays} phiên; thoát khi RSI>${p.rsiSellAbove} hoặc quá ${p.timeStopDays} phiên.`,
    buyZone: buyZoneAboveStop(floorTick(entry * (1 - p.stopPct / 200)), entry, stop),
  };
};

/** RSI hồi > rsiSellAbove hoặc giữ quá timeStopDays → thoát. */
export const rsi2Exit: ExitCheckFn = ({ bars, daysHeld, params }) => {
  const p = { ...RSI2_DEFAULTS, ...params };
  const r = rsi(bars.map((b) => b.close), p.rsiPeriod);
  if (r !== null && r > p.rsiSellAbove) return "rsi-revert-exit";
  if (daysHeld >= p.timeStopDays) return "time-stop";
  return null;
};
