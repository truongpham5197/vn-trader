import { prisma } from "./prisma";
import { STRATEGIES } from "./strategy";
import { getSetting, setSetting } from "./settings";
import { esc, sendTelegram } from "./telegram/notify";
import { addCalendarDays } from "./report/signal-evidence";
import { FILL_SESSIONS, HOLD_SESSIONS, outcomeStats, resolveOutcome } from "./report/signal-outcome";
import { runBacktestFromDb } from "./backtest/run";
import type { StrategyDef } from "./strategy/types";
import type { Bar } from "./data/types";
import type { BtMetrics } from "./backtest/engine";
import { vnToday } from "./vn-time";

/**
 * Tự học chiến lược qua mỗi phiên:
 * - learnFromOutcomes (chạy sau gradeSignals trong scan): mô phỏng lại các gợi ý
 *   đã chấm 120 ngày với bộ tham số lân cận trên PARAM_LADDER — cùng tập cơ hội,
 *   khác tham số → so công bằng. Tốt hơn rõ → dịch đúng 1 bậc (hill-climb).
 * - learnWeekly (Chủ nhật): backtest 12 tháng VN30 kiểm chứng — OOS expectancy
 *   tốt hơn rõ mới giữ/đổi; mặc định thắng → revert về defaults.
 * Mọi thay đổi ghi StrategyTune + báo Telegram owner (kind system). Tự động trong
 * biên thang — không bao giờ vượt giá trị min/max đã định.
 */

const LEARN_DAYS = 120; // cửa sổ gợi ý đã chấm đem ra học
const MAX_SIGNALS = 160; // gợi ý gần nhất đưa vào mô phỏng
const WARMUP_DAYS = 210; // nến lịch sử nạp thêm trước gợi ý sớm nhất (theo ngày dương)
const MIN_SAMPLE = 20; // tối thiểu gợi ý đã chấm mới bắt đầu học
const MIN_CAND_TRADES = 10; // bộ tham số phải mô phỏng được ≥10 lệnh chốt kết quả
const MARGIN_PCT = 1.0; // TB net/lệnh phải tốt hơn ≥1 điểm % mới đổi
const NEW_RESOLVED_COOLDOWN = 8; // sau mỗi lần chỉnh cần ≥8 gợi ý chấm mới để đánh giá tiếp
const MAX_AFTER = FILL_SESSIONS + Math.max(...Object.values(HOLD_SESSIONS)) + 2;
const WEEKLY_BT_DAYS = 365;
const WEEKLY_UNIVERSE = "vn30"; // nhẹ, đủ trong 60s function
const WEEKLY_CANDIDATES = 5; // hiện tại + mặc định + tối đa 3 lân cận tốt nhất
const WEEKLY_DEADLINE_MS = 45_000;
const WEEKLY_RESKIP_DAYS = 6; // tune weekly/revert trong 6 ngày → bỏ qua (idempotent 2 route)

/** Thang giá trị được phép tự tinh chỉnh — nudge chỉ dịch 1 bậc, không bao giờ ra ngoài. */
export const PARAM_LADDER: Record<string, Record<string, number[]>> = {
  "breakout-20": {
    donchian: [15, 20, 25, 30],
    volMult: [1.2, 1.5, 2, 2.5],
    atrPeriod: [10, 14, 20],
    atrStopMult: [1.5, 2, 2.5, 3],
    rrTarget: [1.5, 2, 2.5, 3],
  },
  "pullback-ma20": {
    maFast: [10, 15, 20, 25],
    maSlow: [40, 50, 60],
    volDryMult: [0.6, 0.8, 1, 1.2],
    atrPeriod: [10, 14, 20],
    atrStopMult: [1, 1.5, 2, 2.5],
    rrTarget: [1.5, 2, 2.5, 3],
  },
  "rsi2-revert": {
    rsiPeriod: [2, 3, 4],
    rsiBuyBelow: [3, 5, 10, 15, 20],
    rsiSellAbove: [55, 60, 70, 80],
    trendMa: [30, 50, 100],
    stopPct: [2, 3, 4, 5, 6],
    timeStopDays: [3, 5, 8, 10],
    rrTarget: [1, 1.5, 2, 2.5],
  },
};

const keyOf = (p: Record<string, number>) => JSON.stringify(p);

function dedupe(list: Record<string, number>[]): Record<string, number>[] {
  return [...new Map(list.map((p) => [keyOf(p), p])).values()];
}

/** Tổ hợp tham số vô nghĩa — chặn trước khi mô phỏng/backtest. */
export function validCombo(type: string, p: Record<string, number>): boolean {
  if (type === "pullback-ma20" && p.maFast >= p.maSlow) return false;
  if (type === "rsi2-revert" && p.rsiBuyBelow >= p.rsiSellAbove) return false;
  return true;
}

/** Các bộ lân cận: mỗi tham số dịch ±1 bậc trên thang, giữ nguyên phần còn lại. */
export function neighborsOf(type: string, params: Record<string, number>): Record<string, number>[] {
  const ladder = PARAM_LADDER[type] ?? {};
  const seen = new Map<string, Record<string, number>>();
  for (const [k, raw] of Object.entries(ladder)) {
    const cur = params[k];
    if (cur === undefined) continue;
    const steps = [...new Set(raw)].sort((a, b) => a - b);
    for (const v of [steps.filter((x) => x < cur).pop(), steps.find((x) => x > cur)]) {
      if (v === undefined) continue;
      const c = { ...params, [k]: v };
      if (validCombo(type, c)) seen.set(keyOf(c), c);
    }
  }
  return [...seen.values()];
}

/** "atrStopMult: 1.5 → 2, rrTarget: 2 → 2.5" — dùng trong tin nhắn + nhật ký. */
export function diffParams(from: Record<string, number>, to: Record<string, number>): string {
  return Object.keys(to)
    .filter((k) => from[k] !== to[k])
    .map((k) => `${k}: ${from[k] ?? "?"} → ${to[k]}`)
    .join(", ");
}

export interface LearnSignal {
  symbolId: number;
  date: string;
  outcomeDate: string | null;
  ticker: string;
  exchange: string;
  bandPct: number;
}

export interface SymBars {
  bars: Bar[];
  at: Map<string, number>; // date → index trong bars
}

export interface CandStats {
  params: Record<string, number>;
  fired: number; // gợi ý mà bộ tham số này cũng bắn
  resolved: number;
  missed: number;
  wins: number;
  losses: number;
  timeouts: number;
  avgPct: number | null;
  avgR: number | null;
}

/**
 * Chấm một bộ tham số trên cùng tập gợi ý đã chấm: chạy lại strategy fn tại ngày
 * tín hiệu (nến tới hôm đó), nếu bắn thì mô phỏng kế hoạch mới trên nến sau —
 * cùng thước đo resolveOutcome như chấm gợi ý thật.
 */
export function shadowScore(
  type: string,
  def: StrategyDef,
  params: Record<string, number>,
  signals: LearnSignal[],
  barsBySymbol: Map<number, SymBars>,
): CandStats {
  const merged = { ...def.defaults, ...params };
  const histLen = Math.max((def.requiredBars?.(merged) ?? 60) + 20, 80);
  const rows: { outcome: string | null; outcomePct: number | null; outcomeR: number | null }[] = [];
  let fired = 0;
  for (const s of signals) {
    const sb = barsBySymbol.get(s.symbolId);
    const i = sb?.at.get(s.date);
    if (!sb || i === undefined) continue;
    const cand = def.fn({
      ticker: s.ticker,
      exchange: s.exchange,
      bandPct: s.bandPct,
      bars: sb.bars.slice(Math.max(0, i + 1 - histLen), i + 1),
      params: merged,
    });
    if (!cand) continue;
    fired++;
    const o = resolveOutcome(
      { entry: cand.entry, stop: cand.stop, target: cand.target, buyHigh: cand.buyZone?.[1] ?? null, strategyType: type },
      sb.bars.slice(i + 1, i + 1 + MAX_AFTER),
    );
    if (o) rows.push({ outcome: o.outcome, outcomePct: o.pct, outcomeR: o.r });
  }
  const st = outcomeStats(rows);
  return { params: merged, fired, resolved: st.resolved, missed: st.missed, wins: st.wins, losses: st.losses, timeouts: st.timeouts, avgPct: st.avgPct, avgR: st.avgR };
}

/** Quyết định nudge: chỉ khi đủ mẫu hiện tại + có lân cận tốt hơn rõ mà không cắt quá nhiều lệnh. */
export function decideMove(cur: CandStats, cands: CandStats[]): CandStats | null {
  if (cur.avgPct === null || cur.resolved < MIN_CAND_TRADES) return null;
  const better = cands
    .filter(
      (c) =>
        c.avgPct !== null &&
        c.fired >= MIN_CAND_TRADES &&
        c.resolved >= Math.max(MIN_CAND_TRADES, cur.resolved * 0.4) &&
        c.avgPct > (cur.avgPct ?? 0) + MARGIN_PCT,
    )
    .sort((a, b) => (b.avgPct ?? 0) - (a.avgPct ?? 0) || (b.avgR ?? 0) - (a.avgR ?? 0));
  return better[0] ?? null;
}

/** Điểm backtest: ưu tiên OOS expectancy (30% cuối); ít lệnh OOS thì nhìn cả kỳ; quá ít → không chấm. */
export function btScore(m: BtMetrics): number | null {
  if (m.oosTrades >= 6) return m.oosExpectancyNet;
  if (m.closedTrades >= 15) return m.expectancyNet;
  return null;
}

const fmtPct = (v: number | null) => (v === null ? "?" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}`);
const fmtTr = (v: number) => `${v >= 0 ? "+" : ""}${(v / 1e6).toFixed(1)}tr`;

interface StrategyRow {
  id: number;
  type: string;
  params: string;
}

async function loadLearnSignals(strategyId: number, today: string): Promise<LearnSignal[]> {
  const rows = await prisma.signal.findMany({
    where: { strategyId, outcome: { not: null }, date: { gte: addCalendarDays(today, -LEARN_DAYS) } },
    orderBy: { date: "desc" },
    take: MAX_SIGNALS,
    select: {
      symbolId: true,
      date: true,
      outcomeDate: true,
      symbol: { select: { ticker: true, exchange: true, bandPct: true } },
    },
  });
  return rows.map((r) => ({
    symbolId: r.symbolId,
    date: r.date,
    outcomeDate: r.outcomeDate,
    ticker: r.symbol.ticker,
    exchange: r.symbol.exchange,
    bandPct: r.symbol.bandPct,
  }));
}

async function loadBars(signals: LearnSignal[]): Promise<Map<number, SymBars>> {
  const out = new Map<number, SymBars>();
  if (!signals.length) return out;
  const from = addCalendarDays(signals[signals.length - 1].date, -WARMUP_DAYS);
  const rows = await prisma.dailyBar.findMany({
    where: { symbolId: { in: [...new Set(signals.map((s) => s.symbolId))] }, date: { gte: from } },
    orderBy: [{ symbolId: "asc" }, { date: "asc" }],
    select: { symbolId: true, date: true, open: true, high: true, low: true, close: true, volume: true },
  });
  for (const r of rows) {
    let sb = out.get(r.symbolId);
    if (!sb) {
      sb = { bars: [], at: new Map() };
      out.set(r.symbolId, sb);
    }
    sb.at.set(r.date, sb.bars.length);
    sb.bars.push({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume });
  }
  return out;
}

async function applyTune(
  st: StrategyRow,
  kind: string,
  from: Record<string, number>,
  to: Record<string, number>,
  reason: string,
  evidence: unknown,
): Promise<void> {
  await prisma.$transaction([
    prisma.strategy.update({ where: { id: st.id }, data: { params: JSON.stringify(to) } }),
    prisma.strategyTune.create({
      data: {
        strategyType: st.type,
        kind,
        fromParams: JSON.stringify(from),
        toParams: JSON.stringify(to),
        reason,
        evidence: evidence === undefined ? null : JSON.stringify(evidence),
      },
    }),
  ]);
}

const statBrief = (s: CandStats) => ({ fired: s.fired, resolved: s.resolved, wins: s.wins, losses: s.losses, timeouts: s.timeouts, missed: s.missed, avgPct: s.avgPct, avgR: s.avgR });

async function nudgeStrategy(st: StrategyRow, def: StrategyDef, today: string): Promise<boolean> {
  const signals = await loadLearnSignals(st.id, today);
  if (signals.length < MIN_SAMPLE) return false;

  // Chờ đủ gợi ý chấm MỚI sau lần chỉnh trước — mỗi thay đổi cần thời gian để thấy hiệu quả.
  const lastTune = await prisma.strategyTune.findFirst({
    where: { strategyType: st.type },
    orderBy: { id: "desc" },
    select: { createdAt: true },
  });
  if (lastTune) {
    const tuneDate = lastTune.createdAt.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    if (signals.filter((s) => (s.outcomeDate ?? "") > tuneDate).length < NEW_RESOLVED_COOLDOWN) return false;
  }

  const cur = { ...def.defaults, ...(JSON.parse(st.params) as Record<string, number>) };
  const cands = dedupe([cur, ...neighborsOf(st.type, cur), { ...def.defaults }]);
  const bars = await loadBars(signals);
  const stats = cands.map((c) => shadowScore(st.type, def, c, signals, bars));
  const curStat = stats[0];
  const next = decideMove(curStat, stats.slice(1));
  if (!next) return false;

  const reason = `${signals.length} gợi ý đã chấm ${LEARN_DAYS} ngày: bộ mới mô phỏng TB ${fmtPct(next.avgPct)}%/lệnh (${next.resolved} lệnh, ${next.wins} chạm chốt) vs hiện tại ${fmtPct(curStat.avgPct)}%/lệnh (${curStat.resolved} lệnh)`;
  await applyTune(st, "nudge", cur, next.params, reason, { sample: signals.length, stats: stats.map(statBrief) });
  await sendTelegram(
    [
      `🧠 <b>TỰ HỌC — ${esc(st.type)}</b>`,
      `🔧 ${esc(diffParams(cur, next.params))}`,
      `Vì sao: ${esc(reason)}.`,
      `<i>Mỗi phiên chỉ dịch 1 bậc trong thang giới hạn; cuối tuần backtest kiểm chứng lại — xấu hơn sẽ quay về.</i>`,
    ].join("\n"),
    undefined,
    { kind: "system" },
  );
  return true;
}

/** Sau gradeSignals mỗi phiên — 1 lần/phiên nến (Setting learnDate). Trả về các chiến lược vừa tự đổi. */
export async function learnFromOutcomes(completed: string): Promise<string[]> {
  if ((await getSetting("learnDate")) === completed) return [];
  await setSetting("learnDate", completed);
  const today = vnToday();
  const tuned: string[] = [];
  for (const st of await prisma.strategy.findMany({ where: { enabled: true }, select: { id: true, type: true, params: true } })) {
    const def = STRATEGIES[st.type];
    if (!def) continue;
    try {
      if (await nudgeStrategy(st, def, today)) tuned.push(st.type);
    } catch (e) {
      console.error("[learn]", st.type, e);
    }
  }
  return tuned;
}

/** Chủ nhật: backtest kiểm chứng bộ tham số hiện tại vs mặc định vs lân cận đáng thử nhất. */
export async function learnWeekly(): Promise<{ tuned: string[] }> {
  const today = vnToday();
  const fromDate = addCalendarDays(today, -WEEKLY_BT_DAYS);
  const deadline = Date.now() + WEEKLY_DEADLINE_MS;
  const tuned: string[] = [];
  const lines: string[] = [];

  for (const st of await prisma.strategy.findMany({ where: { enabled: true }, select: { id: true, type: true, params: true } })) {
    const def = STRATEGIES[st.type];
    if (!def) continue;
    try {
      const recent = await prisma.strategyTune.findFirst({
        where: {
          strategyType: st.type,
          kind: { in: ["weekly", "revert"] },
          createdAt: { gte: new Date(Date.now() - WEEKLY_RESKIP_DAYS * 86400e3) },
        },
        select: { id: true },
      });
      if (recent) continue;

      const cur = { ...def.defaults, ...(JSON.parse(st.params) as Record<string, number>) };

      // Ưu tiên backtest lân cận có mô phỏng gợi ý thật tốt nhất trước khi hết giờ
      const signals = await loadLearnSignals(st.id, today);
      const bars = await loadBars(signals);
      const ranked = neighborsOf(st.type, cur)
        .map((c) => shadowScore(st.type, def, c, signals, bars))
        .sort((a, b) => (b.avgPct ?? -Infinity) - (a.avgPct ?? -Infinity));
      const cands = dedupe([cur, { ...def.defaults }, ...ranked.map((r) => r.params)]).slice(0, WEEKLY_CANDIDATES);

      const runs: { params: Record<string, number>; m: BtMetrics; score: number | null }[] = [];
      for (const c of cands) {
        if (Date.now() > deadline) break;
        try {
          const { result } = await runBacktestFromDb({
            strategyType: st.type,
            params: c,
            universe: WEEKLY_UNIVERSE,
            fromDate,
            toDate: today,
            persist: false,
          });
          runs.push({ params: c, m: result.metrics, score: btScore(result.metrics) });
        } catch (e) {
          console.error("[learn-weekly]", st.type, c, e);
        }
      }

      const curRun = runs.find((r) => keyOf(r.params) === keyOf(cur));
      const curScore = curRun?.score ?? null;
      const best = runs.filter((r) => r.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
      const promote =
        best &&
        keyOf(best.params) !== keyOf(cur) &&
        best.score !== null &&
        best.score > 0 &&
        (curScore === null || curScore <= 0 || best.score >= curScore * 1.2);

      const evidence = runs.map((r) => ({ params: r.params, oosTrades: r.m.oosTrades, oosExpectancyNet: r.m.oosExpectancyNet, closedTrades: r.m.closedTrades, expectancyNet: r.m.expectancyNet, score: r.score }));
      if (promote && best) {
        const kind = keyOf(best.params) === keyOf({ ...def.defaults }) ? "revert" : "weekly";
        const reason = `backtest ${WEEKLY_BT_DAYS}n VN30: OOS ${fmtTr(best.score ?? 0)}/lệnh (${best.m.oosTrades} lệnh) vs hiện tại ${curScore === null ? "?" : fmtTr(curScore)}/lệnh`;
        await applyTune(st, kind, cur, best.params, reason, evidence);
        lines.push(`• ${st.type}: ĐỔI ${diffParams(cur, best.params)} — ${reason}`);
        tuned.push(st.type);
      } else {
        lines.push(`• ${st.type}: giữ nguyên — OOS ${curScore === null ? "chưa đủ lệnh" : `${fmtTr(curScore)}/lệnh`}${best ? `, tốt nhất ${fmtTr(best.score ?? 0)}` : ""}`);
      }
    } catch (e) {
      console.error("[learn-weekly]", st.type, e);
    }
  }

  if (lines.length) {
    await sendTelegram(
      [`🧠 <b>TỰ HỌC TUẦN — kiểm chứng backtest ${WEEKLY_BT_DAYS} ngày (VN30, OOS 30% cuối)</b>`, ...lines.map((l) => esc(l))].join("\n"),
      undefined,
      { kind: "system" },
    );
  }
  return { tuned };
}
