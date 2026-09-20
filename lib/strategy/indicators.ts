import type { Bar } from "../data/types";

export function sma(values: number[], period: number, end?: number): number | null {
  const endIdx = end ?? values.length;
  if (endIdx < period) return null;
  let sum = 0;
  for (let i = endIdx - period; i < endIdx; i++) sum += values[i];
  return sum / period;
}

/** Highest high của `period` bar TRƯỚC bar tại index `end` (không gồm bar end). */
export function highestHighBefore(bars: Bar[], period: number, end: number): number | null {
  const start = end - period;
  if (start < 0) return null;
  let max = -Infinity;
  for (let i = start; i < end; i++) max = Math.max(max, bars[i].high);
  return max;
}

/** RSI Wilder tại bar cuối. */
export function rsi(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** ATR Wilder, period mặc định 14, tính tại bar cuối. */
export function atr(bars: Bar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  // Wilder smoothing
  let a = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trs.length; i++) {
    a = (a * (period - 1) + trs[i]) / period;
  }
  return a;
}
