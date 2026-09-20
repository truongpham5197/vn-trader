import type { ExitCheckFn, StrategyFn } from "./types";
import { rsi, sma } from "./indicators";
import { floorTick } from "./breakout20";

export const RSI2_DEFAULTS = {
  rsiPeriod: 2,
  rsiBuyBelow: 5,
  rsiSellAbove: 70,
  trendMa: 50,
  stopPct: 4,
  timeStopDays: 5,
  rrTarget: 1.5,
};

/**
 * RSI(2) mean-reversion: uptrend (close > MA50) + RSI2 < rsiBuyBelow → mua
 * nhịp điều chỉnh ngắn. Stop = entry × (1 − stopPct%); exit RSI>70 hoặc
 * time-stop 5 phiên.
 */
export const rsi2Revert: StrategyFn = ({ bars, params, bandPct }) => {
  const p = { ...RSI2_DEFAULTS, ...params };
  const n = bars.length;
  if (n < p.trendMa + 10) return null;

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

  return {
    entry,
    stop,
    target,
    rr: p.rrTarget,
    reason: `RSI2=${r.toFixed(1)} < ${p.rsiBuyBelow} trong uptrend (>MA${p.trendMa})`,
    plan: `SL = vào − ${p.stopPct}% = ${stop}; TP = vào + ${p.rrTarget}×rủi ro = ${target}. Kỳ vọng 1–5 phiên; thoát khi RSI>70 hoặc quá 5 phiên.`,
    buyZone: [floorTick(entry * (1 - p.stopPct / 200)), entry], // hồi nhẹ dưới entry
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
