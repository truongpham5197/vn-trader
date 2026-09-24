import type { ExitCheckFn, StrategyFn } from "./types";
import { atr, highestHighBefore, sma } from "./indicators";

export const BREAKOUT20_DEFAULTS = {
  donchian: 20,
  volMult: 1.5,
  atrPeriod: 14,
  atrStopMult: 2,
  rrTarget: 2,
};

export function breakout20RequiredBars(params: Record<string, number> = {}): number {
  const p = { ...BREAKOUT20_DEFAULTS, ...params };
  return p.donchian + p.atrPeriod + 2;
}

/**
 * Donchian breakout: đóng cửa vượt đỉnh N phiên + vol > volMult × avg20,
 * giá chưa chạm trần. Entry = close (đặt LO phiên sau), stop = entry − 2×ATR,
 * target = entry + rrTarget × (entry − stop).
 */
export const breakout20: StrategyFn = ({ bars, params, bandPct }) => {
  const p = { ...BREAKOUT20_DEFAULTS, ...params };
  const n = bars.length;
  if (n < breakout20RequiredBars(p)) return null;

  const last = bars[n - 1];
  const prev = bars[n - 2];

  const hh = highestHighBefore(bars, p.donchian, n - 1);
  if (hh === null || last.close <= hh) return null;

  const volumes = bars.slice(0, n - 1).map((b) => b.volume);
  const avgVol = sma(volumes, p.donchian);
  if (avgVol === null || last.volume <= avgVol * p.volMult) return null;

  const ceiling = prev.close * (1 + bandPct);
  if (last.close >= ceiling - 1e-9) return null; // đã trần, không đuổi

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
    reason: `Giá đóng cửa ${entry} vượt đỉnh ${p.donchian} phiên (${hh.toFixed(2)}), khối lượng gấp ${(last.volume / avgVol).toFixed(1)}× trung bình ${p.donchian} phiên`,
    plan: `SL = vào − ${p.atrStopMult}×ATR (${a.toFixed(2)}) = ${stop}; TP = vào + ${p.rrTarget}×rủi ro = ${target.toFixed(2)}. Kỳ vọng 5–15 phiên; thoát sớm nếu đóng cửa < MA10 (trailing).`,
    buyZone: buyZoneAboveStop(floorTick(hh), floorTick(entry * 1.01), stop),
  };
};

/** Bước giá HOSE/HNX: 0.05 dưới 10k, 0.1 dưới 50k, 0.5 từ 50k (nghìn đồng). */
function tickSize(price: number): number {
  return price < 10 ? 0.05 : price < 50 ? 0.1 : 0.5;
}

export function roundTick(price: number): number {
  return Math.round(price / tickSize(price)) * tickSize(price);
}

/** Làm tròn XUỐNG theo tick — dùng cho stop/target để không xô stop lên sát entry. */
export function floorTick(price: number): number {
  return Math.floor(price / tickSize(price)) * tickSize(price);
}

/** RR thực sau khi stop/target đã làm tròn tick. */
export function realizedRr(entry: number, stop: number, target: number): number {
  const risk = entry - stop;
  if (risk <= 0) return 0;
  return Math.round(((target - entry) / risk) * 100) / 100;
}

export function validBuyZone(a: number, b: number): [number, number] | undefined {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (!(lo > 0) || !(hi > lo)) return undefined;
  return [lo, hi];
}

/** Đáy vùng mua phải trên cắt lỗ. Mua ở đáy vùng mà đã chạm cắt lỗ thì vùng không dùng được. */
export function buyZoneAboveStop(lo: number, hi: number, stop: number): [number, number] | undefined {
  return validBuyZone(Math.max(lo, floorTick(stop + tickSize(stop))), hi);
}

/** Trailing theo MA10: đóng cửa thủng MA10 → thoát. */
export const breakout20Exit: ExitCheckFn = ({ bars }) => {
  const ma10 = sma(bars.map((b) => b.close), 10);
  if (ma10 !== null && bars[bars.length - 1].close < ma10) return "trailing-ma10";
  return null;
};
