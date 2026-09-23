import type { ExitCheckFn, StrategyFn } from "./types";
import { atr, highestHighBefore, sma } from "./indicators";

export const BREAKOUT20_DEFAULTS = {
  donchian: 20,
  volMult: 1.5,
  atrPeriod: 14,
  atrStopMult: 2,
  rrTarget: 2,
};

/**
 * Donchian breakout: đóng cửa vượt đỉnh N phiên + vol > volMult × avg20,
 * giá chưa chạm trần. Entry = close (đặt LO phiên sau), stop = entry − 2×ATR,
 * target = entry + rrTarget × (entry − stop).
 */
export const breakout20: StrategyFn = ({ bars, params, bandPct }) => {
  const p = { ...BREAKOUT20_DEFAULTS, ...params };
  const n = bars.length;
  if (n < p.donchian + p.atrPeriod + 2) return null;

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

  return {
    entry,
    stop,
    target,
    rr: p.rrTarget,
    reason: `Giá đóng cửa ${entry} vượt đỉnh ${p.donchian} phiên (${hh.toFixed(2)}), khối lượng gấp ${(last.volume / avgVol).toFixed(1)}× trung bình 20 phiên → dòng tiền vào mạnh, có thể mở nhịp tăng mới`,
    plan: `SL = vào − 2×ATR (${a.toFixed(2)}) = ${stop}; TP = vào + 2×rủi ro = ${target.toFixed(2)}. Kỳ vọng 5–15 phiên; thoát sớm nếu đóng cửa < MA10 (trailing).`,
    buyZone: [floorTick(hh), floorTick(entry * 1.01)], // retest đỉnh cũ → tối đa +1%
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

/** Trailing theo MA10: đóng cửa thủng MA10 → thoát. */
export const breakout20Exit: ExitCheckFn = ({ bars }) => {
  const ma10 = sma(bars.map((b) => b.close), 10);
  if (ma10 !== null && bars[bars.length - 1].close < ma10) return "trailing-ma10";
  return null;
};
