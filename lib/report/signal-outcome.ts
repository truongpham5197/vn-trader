import { netPnlPct } from "../fees";

/**
 * "Trả bài" gợi ý mua: giả lập đúng kế hoạch đã gửi trên nến ngày sau tín hiệu —
 * khớp nếu giá về vùng mua trong FILL_SESSIONS phiên, bán chỉ từ T+2, chạm cắt lỗ/chốt lời
 * hoặc hết số phiên giữ theo chiến lược. Cùng nến chạm cả hai → tính cắt lỗ (xấu nhất).
 * Là mô phỏng trên nến ngày, không phải lệnh khớp thật.
 */
export const FILL_SESSIONS = 3;
export const HOLD_SESSIONS: Record<string, number> = { "breakout-20": 15, "pullback-ma20": 10, "rsi2-revert": 5 };
const DEFAULT_HOLD = 10;
const T2 = 2;

export type Outcome = "win" | "loss" | "time" | "missed";

export interface OutcomeResult {
  outcome: Outcome;
  fill: number | null;
  exit: number | null;
  pct: number | null; // net sau phí+thuế
  r: number | null; // lãi/lỗ theo đơn vị rủi ro (fill − stop)
  date: string; // phiên chốt kết quả
}

export interface OutcomeBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function holdSessions(strategyType: string): number {
  return HOLD_SESSIONS[strategyType] ?? DEFAULT_HOLD;
}

/** null = chưa đủ phiên để chấm. `bars` = nến SAU ngày tín hiệu, tăng dần. */
export function resolveOutcome(
  s: { entry: number; stop: number; target: number; buyHigh: number | null; strategyType: string },
  bars: OutcomeBar[],
): OutcomeResult | null {
  const cap = s.buyHigh ?? s.entry;
  let fi = -1;
  let fill = 0;
  for (let i = 0; i < Math.min(bars.length, FILL_SESSIONS); i++) {
    const b = bars[i];
    if (b.low <= cap) {
      fi = i;
      fill = Math.min(b.open, cap);
      break;
    }
  }
  if (fi < 0) {
    if (bars.length < FILL_SESSIONS) return null;
    return { outcome: "missed", fill: null, exit: null, pct: null, r: null, date: bars[FILL_SESSIONS - 1].date };
  }
  const risk = fill - s.stop;
  const done = (outcome: Outcome, exit: number, date: string): OutcomeResult => ({
    outcome,
    fill,
    exit,
    pct: netPnlPct(fill, exit),
    r: risk > 0 ? (exit - fill) / risk : null,
    date,
  });
  const last = fi + holdSessions(s.strategyType);
  for (let i = fi + T2; i < bars.length && i <= last; i++) {
    const b = bars[i];
    if (b.open <= s.stop) return done("loss", b.open, b.date);
    if (b.open >= s.target) return done("win", b.open, b.date);
    if (b.low <= s.stop) return done("loss", s.stop, b.date);
    if (b.high >= s.target) return done("win", s.target, b.date);
    if (i === last) return done("time", b.close, b.date);
  }
  return null;
}

export interface OutcomeStats {
  resolved: number; // khớp + đã chốt (win/loss/time)
  missed: number;
  wins: number;
  losses: number;
  timeouts: number;
  avgPct: number | null;
  sumR: number;
  avgR: number | null;
}

export function outcomeStats(rows: { outcome: string | null; outcomePct: number | null; outcomeR: number | null }[]): OutcomeStats {
  const done = rows.filter((r) => r.outcome === "win" || r.outcome === "loss" || r.outcome === "time");
  const pcts = done.map((r) => r.outcomePct).filter((x): x is number => x !== null);
  const rs = done.map((r) => r.outcomeR).filter((x): x is number => x !== null);
  const sumR = rs.reduce((a, b) => a + b, 0);
  return {
    resolved: done.length,
    missed: rows.filter((r) => r.outcome === "missed").length,
    wins: done.filter((r) => r.outcome === "win").length,
    losses: done.filter((r) => r.outcome === "loss").length,
    timeouts: done.filter((r) => r.outcome === "time").length,
    avgPct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
    sumR,
    avgR: rs.length ? sumR / rs.length : null,
  };
}

/** Mẫu tối thiểu để nói chiến lược đang thua — ít hơn thì chỉ nói "mẫu còn ít". */
export const MIN_RECORD = 20;

/** Chiến lược đang thua trên gợi ý thật đã chấm (đủ mẫu, TB net âm) → cảnh báo + xếp cuối, không tự đổi tham số. */
export const losingRecord = (s: OutcomeStats) => s.resolved >= MIN_RECORD && s.avgPct !== null && s.avgPct < 0;

const sg = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;

/** Một dòng thành tích cho tin gợi ý mua — text thường, không có ký tự HTML. */
export function recordLine(s: OutcomeStats, label: string): string {
  if (!s.resolved) return `${label}: chưa có gợi ý nào đủ phiên để chấm điểm.`;
  const base = `${label}: ${s.wins}/${s.resolved} gợi ý chạm chốt, ${s.losses} thủng cắt lỗ, ${s.timeouts} hết giờ · TB ${s.avgPct === null ? "?" : sg(s.avgPct)}%/lệnh (tổng ${sg(s.sumR)}R)`;
  if (s.resolved < MIN_RECORD) return `${base} — mẫu ${s.resolved} < ${MIN_RECORD}, chưa đủ để kết luận.`;
  return losingRecord(s) ? `${base} — ĐANG THUA, gợi ý mới chỉ để xem.` : base;
}

export const OUTCOME_TEXT: Record<Outcome, string> = {
  win: "chạm chốt lời",
  loss: "thủng cắt lỗ",
  time: "hết số phiên giữ",
  missed: "không về vùng mua, không khớp",
};
