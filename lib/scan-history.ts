import type { Bar } from "./data/types";
import type { StrategyDef } from "./strategy/types";

export function barsRequired(def: StrategyDef, params: Record<string, number> = {}): number {
  const p = { ...def.defaults, ...params };
  return def.requiredBars?.(p) ?? 0;
}

export function maxRequiredBars(
  enabled: { def: StrategyDef; params?: Record<string, number> }[],
): number {
  return enabled.reduce((m, s) => Math.max(m, barsRequired(s.def, s.params ?? {})), 0);
}

export function historyCutoffIso(maxBars: number, nowMs = Date.now()): string {
  const bars = Math.max(maxBars, 1);
  const calendarDays = Math.ceil((bars * 7) / 5) + 14;
  return new Date(nowMs - calendarDays * 86400e3).toISOString().slice(0, 10);
}

/** Số nến cần nạp + mốc ngày đủ lịch sử — module thuần, không prisma. */
export function requiredHistory(maxBars: number, nowMs = Date.now()): { bars: number; cutoff: string } {
  return { bars: maxBars, cutoff: historyCutoffIso(maxBars, nowMs) };
}

export function toAscendingBars<
  T extends { date: string; open: number; high: number; low: number; close: number; volume: number },
>(rowsNewestFirst: T[]): Bar[] {
  const out: Bar[] = [];
  for (let i = rowsNewestFirst.length - 1; i >= 0; i--) {
    const r = rowsNewestFirst[i];
    out.push({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume });
  }
  return out;
}

export function avgValueNewest(rowsNewestFirst: { value: number }[], n = 20): number {
  if (rowsNewestFirst.length === 0) return 0;
  const take = rowsNewestFirst.slice(0, n);
  return take.reduce((s, r) => s + r.value, 0) / take.length;
}

export function dropUnfinishedSession<T extends { date: string }>(
  rowsNewestFirst: T[],
  opts: { today: string; inSession: boolean },
): T[] {
  if (!opts.inSession) return rowsNewestFirst;
  return rowsNewestFirst.filter((r) => r.date !== opts.today);
}

export function batchCompletedDate(
  dates: Iterable<string>,
  opts: { today: string; inSession: boolean },
): string | null {
  let max: string | null = null;
  let second: string | null = null;
  for (const d of dates) {
    if (!max || d > max) {
      if (d !== max) second = max;
      max = d;
    } else if (d !== max && (!second || d > second)) {
      second = d;
    }
  }
  if (!max) return null;
  if (opts.inSession && max === opts.today) return second;
  return max;
}

export function isFreshVsBatch(lastDate: string | undefined, batchDate: string | null): boolean {
  return Boolean(lastDate && batchDate && lastDate === batchDate);
}

/** BUY mới chỉ khi đủ thanh khoản + đủ history — held không nới điều kiện này. */
export function canGenerateBuy(opts: { liquid: boolean; historyOk: boolean }): boolean {
  return opts.liquid && opts.historyOk;
}

export function shouldPersistScanDate(prev: string, next: string | null): boolean {
  if (!next) return false;
  if (!prev) return true;
  return next > prev;
}
