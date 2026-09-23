import type { ExitCheckFn, StrategyFn } from "./types";
import { atr, sma } from "./indicators";
import { floorTick, realizedRr, validBuyZone } from "./breakout20";

export const PULLBACK_DEFAULTS = {
  maFast: 20,
  maSlow: 50,
  volDryMult: 0.8,
  atrPeriod: 14,
  atrStopMult: 1.5,
  rrTarget: 2,
};

export function pullbackRequiredBars(params: Record<string, number> = {}): number {
  const p = { ...PULLBACK_DEFAULTS, ...params };
  return p.maSlow + p.atrPeriod + 2;
}

/**
 * Pullback về MA20 trong uptrend: close > MA50, bar cuối chạm MA20
 * (low <= MA20, close >= MA20 hoặc lân cận), volume khô < volDryMult × avg20.
 * Stop = entry − 1.5×ATR; exit khi close thủng MA50.
 */
export const pullbackMa20: StrategyFn = ({ bars, params }) => {
  const p = { ...PULLBACK_DEFAULTS, ...params };
  const n = bars.length;
  if (n < pullbackRequiredBars(p)) return null;

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
  if (target <= entry) return null;
  const rr = realizedRr(entry, stop, target);
  if (rr <= 0) return null;

  return {
    entry,
    stop,
    target,
    rr,
    reason: `Đang xu hướng tăng (giá > MA${p.maSlow} ${maSlow.toFixed(2)}) và vừa điều chỉnh về MA${p.maFast} ${maFast.toFixed(2)} với khối lượng ${(last.volume / avgVol).toFixed(1)}× trung bình`,
    plan: `SL = vào − ${p.atrStopMult}×ATR (${a.toFixed(2)}) = ${stop}; TP = vào + ${p.rrTarget}×rủi ro = ${target.toFixed(2)}. Kỳ vọng 3–10 phiên; thoát nếu đóng cửa < MA${p.maSlow} (${maSlow.toFixed(2)}).`,
    buyZone: validBuyZone(floorTick(maFast * 0.98), floorTick(entry * 1.005)),
  };
};

/** Đóng cửa thủng MA50 → trend gãy, thoát. */
export const pullbackMa20Exit: ExitCheckFn = ({ bars, params }) => {
  const p = { ...PULLBACK_DEFAULTS, ...params };
  const maSlow = sma(bars.map((b) => b.close), p.maSlow);
  if (maSlow !== null && bars[bars.length - 1].close < maSlow) return "close<ma50";
  return null;
};
