import type { ExitCheckFn, StrategyFn } from "./types";
import { atr, sma } from "./indicators";
import { floorTick } from "./breakout20";

export const PULLBACK_DEFAULTS = {
  maFast: 20,
  maSlow: 50,
  volDryMult: 0.8,
  atrPeriod: 14,
  atrStopMult: 1.5,
  rrTarget: 2,
};

/**
 * Pullback về MA20 trong uptrend: close > MA50, bar cuối chạm MA20
 * (low <= MA20, close >= MA20 hoặc lân cận), volume khô < volDryMult × avg20.
 * Stop = entry − 1.5×ATR; exit khi close thủng MA50.
 */
export const pullbackMa20: StrategyFn = ({ bars, params }) => {
  const p = { ...PULLBACK_DEFAULTS, ...params };
  const n = bars.length;
  if (n < p.maSlow + p.atrPeriod + 2) return null;

  const closes = bars.map((b) => b.close);
  const last = bars[n - 1];

  const maSlow = sma(closes, p.maSlow);
  const maFast = sma(closes, p.maFast);
  if (maSlow === null || maFast === null) return null;
  if (last.close <= maSlow) return null; // phải còn uptrend

  const touchesFast = last.low <= maFast && last.close >= maFast * 0.98;
  if (!touchesFast) return null;

  const avgVol = sma(bars.slice(0, n - 1).map((b) => b.volume), 20);
  if (avgVol === null || last.volume > avgVol * p.volDryMult) return null;

  const a = atr(bars, p.atrPeriod);
  if (a === null) return null;

  const entry = last.close;
  const stop = floorTick(entry - p.atrStopMult * a);
  if (stop <= 0 || stop >= entry) return null;
  const target = floorTick(entry + p.rrTarget * (entry - stop));

  return {
    entry,
    stop,
    target,
    rr: p.rrTarget,
    reason: `pullback MA20=${maFast.toFixed(2)} trong uptrend (>MA50=${maSlow.toFixed(2)}), vol ${(last.volume / avgVol).toFixed(1)}x`,
  };
};

/** Đóng cửa thủng MA50 → trend gãy, thoát. */
export const pullbackMa20Exit: ExitCheckFn = ({ bars, params }) => {
  const p = { ...PULLBACK_DEFAULTS, ...params };
  const maSlow = sma(bars.map((b) => b.close), p.maSlow);
  if (maSlow !== null && bars[bars.length - 1].close < maSlow) return "close<ma50";
  return null;
};
