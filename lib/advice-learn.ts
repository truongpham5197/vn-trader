import { prisma } from "./prisma";
import { getBool, getSetting, setSetting } from "./settings";
import { esc, sendTelegram } from "./telegram/notify";
import { addCalendarDays } from "./report/signal-evidence";
import { BUY_FEE, SELL_FEE_TAX, netPnl } from "./fees";
import { vnToday } from "./vn-time";
import {
  ADVICE_DEFAULTS,
  ADVICE_LADDER,
  ADVICE_LEARNABLE,
  type AdviceParams,
  type LearnableParam,
} from "./advice-params";

/**
 * Tự học NHẬN XÉT/ĐỀ XUẤT trên web — song song lib/learn.ts (tham số chiến lược).
 *
 * Cùng triết lý: tham số chỉ dịch ±1 bậc trên ADVICE_LADDER khi đủ mẫu và tốt hơn
 * rõ; mọi đổi ghi AdviceTune + báo Telegram owner. Khác learn.ts ở thước đo: tham
 * số lời khuyên không sinh lệnh nên chấm như bài toán tách đôi — nhãn hiện khi
 * nào thì kết quả cuối có đi đúng hướng nhãn không (F1 precision/recall).
 *
 * Ground truth có sẵn trong DB, không cần log mới:
 * - Vị thế (nearPct/pnlUp/pnlDown): Trade đã đóng + DailyBar trong kỳ giữ
 *   (min low/max high = lúc nhãn đáng lẽ hiện) → kết quả pnl cuối.
 * - Gợi ý (minNetRR): Signal đã chấm outcome — R:R sau phí tính tại giá vào của
 *   chính gợi ý; đổi ngưỡng = đổi tập gợi ý được gắn "Có thể cân nhắc".
 *
 * Nhầm thì nhịp sau tự dịch lại — hill-climb hai chiều trong thang.
 */

const PARAMS_KEY = "adviceParams";
const LEARN_DAYS = 120; // cửa sổ gợi ý đã chấm (giống learn.ts)
const TRADE_DAYS = 150; // cửa sổ lệnh đã đóng đem ra học (lệnh giữ dài hơn gợi ý)
const MAX_TRADES = 300;
const MAX_SIGNALS = 300;
const MIN_SAMPLE = 15; // tối thiểu mẫu để chấm 1 tham số
const MIN_FIRED = 6; // nhãn phải hiện ≥6 lần trong mẫu thì F1 mới đáng tin
const MARGIN_F1 = 0.05; // F1 lân cận phải hơn hiện tại ≥0.05 mới dịch
const NEW_SAMPLES_COOLDOWN = 5; // sau mỗi lần chỉnh cần ≥5 mẫu mới để đánh giá tiếp

const CACHE_MS = 60_000;
let cache: { at: number; v: AdviceParams } | null = null;

/** Bộ tham số nhận xét đang dùng — Setting "adviceParams" (JSON) merge mặc định, chỉ nhận giá trị trong thang. */
export async function getAdviceParams(fresh = false): Promise<AdviceParams> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.v;
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse((await getSetting(PARAMS_KEY)) || "{}") as Record<string, unknown>;
  } catch {
    raw = {};
  }
  const v = { ...ADVICE_DEFAULTS };
  for (const k of Object.keys(ADVICE_LADDER) as (keyof AdviceParams)[]) {
    const n = Number(raw[k]);
    if (Number.isFinite(n) && ADVICE_LADDER[k].includes(n)) v[k] = n;
  }
  cache = { at: Date.now(), v };
  return v;
}

/** Ghi bộ tham số mới (đã merge) — gọi từ learnAdvice / chỉnh tay. */
export async function setAdviceParams(v: AdviceParams): Promise<void> {
  cache = { at: Date.now(), v };
  await setSetting(PARAMS_KEY, JSON.stringify(v));
}

// ---------- Chấm nhãn như bài toán tách đôi ----------

/** 1 lệnh đã đóng: cực trị giá trong kỳ giữ (lúc nhãn đáng lẽ hiện) → pnl cuối. */
export interface Episode {
  entry: number;
  stop: number | null;
  target: number | null;
  minLow: number | null;
  maxHigh: number | null;
  pnl: number; // net đã chốt
  closeDate: string; // YYYY-MM-DD giờ VN — cooldown theo mẫu mới
}

export interface BandStat {
  fired: number; // nhãn đáng lẽ đã hiện bao nhiêu lần
  matched: number; // trong đó kết quả đi đúng hướng nhãn
  total: number; // sự kiện có dữ liệu
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export function bandStat(events: { fired: boolean; matched: boolean }[]): BandStat {
  const fired = events.filter((e) => e.fired);
  const matched = fired.filter((e) => e.matched).length;
  const hits = events.filter((e) => e.matched).length;
  const precision = fired.length ? matched / fired.length : null;
  const recall = hits ? matched / hits : null;
  const f1 =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;
  return { fired: fired.length, matched, total: events.length, precision, recall, f1 };
}

/** nearPct: cảnh báo "sát cắt lỗ/chốt lời" — gộp 2 phía, mỗi lệnh góp tối đa 2 sự kiện. */
export function nearPctStat(eps: Episode[], x: number): BandStat {
  const ev: { fired: boolean; matched: boolean }[] = [];
  for (const e of eps) {
    if (e.stop && e.minLow !== null)
      ev.push({ fired: e.minLow <= e.stop * (1 + x / 100), matched: e.pnl <= 0 });
    if (e.target && e.maxHigh !== null)
      ev.push({ fired: e.maxHigh >= e.target * (1 - x / 100), matched: e.pnl > 0 });
  }
  return bandStat(ev);
}

/** pnlUp: "đang xanh" — high kỳ giữ đạt +x% net thì lệnh đáng lẽ kết thúc lãi. */
export function pnlUpStat(eps: Episode[], x: number): BandStat {
  return bandStat(
    eps
      .filter((e) => e.maxHigh !== null)
      .map((e) => ({
        fired: (e.maxHigh! * (1 - SELL_FEE_TAX)) / (e.entry * (1 + BUY_FEE)) - 1 >= x / 100,
        matched: e.pnl > 0,
      })),
  );
}

/** pnlDown: "đỏ nhẹ" — low kỳ giữ chạm −x% net thì lệnh đáng lẽ kết thúc lỗ. */
export function pnlDownStat(eps: Episode[], x: number): BandStat {
  return bandStat(
    eps
      .filter((e) => e.minLow !== null)
      .map((e) => ({
        fired: (e.minLow! * (1 - SELL_FEE_TAX)) / (e.entry * (1 + BUY_FEE)) - 1 <= -x / 100,
        matched: e.pnl <= 0,
      })),
  );
}

export interface ResolvedSignal {
  entry: number;
  stop: number;
  target: number;
  outcomePct: number;
  outcomeDate: string | null;
}

/** minNetRR: "Có thể cân nhắc" — R:R sau phí tại giá vào ≥ x thì gợi ý đáng lẽ lãi. */
export function minNetRRStat(sigs: ResolvedSignal[], x: number): BandStat {
  return bandStat(
    sigs.map((s) => {
      const risk = -netPnl(s.entry, s.stop, 1);
      const rr = risk > 0 ? netPnl(s.entry, s.target, 1) / risk : 0;
      return { fired: rr >= x, matched: s.outcomePct > 0 };
    }),
  );
}

export interface ParamCand {
  x: number;
  stat: BandStat;
}

/** Chỉ đổi khi đủ mẫu hiện tại + lân cận có F1 tốt hơn ≥MARGIN_F1 và đủ lần hiện nhãn. */
export function decideParam(cur: ParamCand, cands: ParamCand[]): ParamCand | null {
  if (cur.stat.total < MIN_SAMPLE || cur.stat.f1 === null) return null;
  const better = cands
    .filter((c) => c.stat.f1 !== null && c.stat.fired >= MIN_FIRED && c.stat.f1 > cur.stat.f1! + MARGIN_F1)
    .sort((a, b) => b.stat.f1! - a.stat.f1!);
  return better[0] ?? null;
}

// ---------- Nạp mẫu từ DB ----------

const vnDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

async function loadTradeEpisodes(): Promise<Episode[]> {
  const trades = await prisma.trade.findMany({
    where: {
      status: "closed",
      pnl: { not: null },
      closedAt: { gte: new Date(Date.now() - TRADE_DAYS * 86400e3) },
    },
    orderBy: { closedAt: "desc" },
    take: MAX_TRADES,
    select: {
      symbolId: true,
      entryPrice: true,
      stopPrice: true,
      targetPrice: true,
      pnl: true,
      openedAt: true,
      closedAt: true,
    },
  });
  if (!trades.length) return [];
  const open = trades.map((t) => vnDate(t.openedAt));
  const close = trades.map((t) => vnDate(t.closedAt!));
  const bars = await prisma.dailyBar.findMany({
    where: {
      symbolId: { in: [...new Set(trades.map((t) => t.symbolId))] },
      date: { gte: open.reduce((a, b) => (a < b ? a : b)), lte: close.reduce((a, b) => (a > b ? a : b)) },
    },
    select: { symbolId: true, date: true, low: true, high: true },
    orderBy: { date: "asc" },
  });
  const bySym = new Map<number, typeof bars>();
  for (const b of bars) bySym.set(b.symbolId, [...(bySym.get(b.symbolId) ?? []), b]);
  return trades.map((t, i) => {
    const win = (bySym.get(t.symbolId) ?? []).filter((b) => b.date >= open[i] && b.date <= close[i]);
    return {
      entry: t.entryPrice,
      stop: t.stopPrice,
      target: t.targetPrice,
      pnl: t.pnl!,
      closeDate: close[i],
      minLow: win.length ? Math.min(...win.map((b) => b.low)) : null,
      maxHigh: win.length ? Math.max(...win.map((b) => b.high)) : null,
    };
  });
}

async function loadResolvedSignals(): Promise<ResolvedSignal[]> {
  const rows = await prisma.signal.findMany({
    where: {
      outcome: { not: null },
      outcomePct: { not: null },
      date: { gte: addCalendarDays(vnToday(), -LEARN_DAYS) },
    },
    orderBy: { date: "desc" },
    take: MAX_SIGNALS,
    select: { entry: true, stop: true, target: true, outcomePct: true, outcomeDate: true },
  });
  return rows.map((s) => ({ entry: s.entry, stop: s.stop, target: s.target, outcomePct: s.outcomePct!, outcomeDate: s.outcomeDate }));
}

// ---------- Vòng học ----------

const PARAM_LABEL: Record<LearnableParam, string> = {
  nearPct: "Ngưỡng «sát cắt lỗ/chốt lời»",
  pnlUp: "Ngưỡng «đang xanh»",
  pnlDown: "Ngưỡng «đỏ nhẹ»",
  minNetRR: "Ngưỡng R:R gắn «có thể cân nhắc»",
};

function ladderNeighbors(key: LearnableParam, cur: number): number[] {
  const steps = ADVICE_LADDER[key];
  return [steps.filter((v) => v < cur).pop(), steps.find((v) => v > cur)].filter(
    (v): v is number => v !== undefined,
  );
}

const statBrief = (c: ParamCand) => ({ x: c.x, ...c.stat });
const f2 = (v: number | null) => (v === null ? "?" : v.toFixed(2));

/**
 * Sau learnFromOutcomes mỗi phiên — 1 lần/phiên nến (Setting adviceLearnDate).
 * Trả về các tham số vừa tự đổi.
 */
export async function learnAdvice(completed: string): Promise<string[]> {
  if (!(await getBool("learnEnabled")) || (await getSetting("adviceLearnDate")) === completed)
    return [];
  await setSetting("adviceLearnDate", completed);

  const cur = await getAdviceParams(true);
  const next = { ...cur };
  const [eps, sigs, tunes] = await Promise.all([
    loadTradeEpisodes(),
    loadResolvedSignals(),
    prisma.adviceTune.findMany({ orderBy: { id: "desc" }, take: 100, select: { param: true, createdAt: true } }),
  ]);

  const graders: Record<LearnableParam, (x: number) => BandStat> = {
    nearPct: (x) => nearPctStat(eps, x),
    pnlUp: (x) => pnlUpStat(eps, x),
    pnlDown: (x) => pnlDownStat(eps, x),
    minNetRR: (x) => minNetRRStat(sigs, x),
  };
  // Mẫu mới sau lần chỉnh trước — lệnh đóng/gợi ý chấm sau ngày tune mới tính
  const newSince = (param: string, dates: (string | null)[]): number => {
    const t = tunes.find((x) => x.param === param);
    if (!t) return dates.length; // chưa từng chỉnh → không cooldown
    const d = vnDate(t.createdAt);
    return dates.filter((x) => x !== null && x > d).length;
  };

  const moves: { param: LearnableParam; from: number; to: number; reason: string; evidence: ParamCand[] }[] = [];
  for (const param of ADVICE_LEARNABLE) {
    const tradeParam = param !== "minNetRR";
    const samples = tradeParam ? eps.length : sigs.length;
    if (samples < MIN_SAMPLE) continue;
    if (newSince(param, tradeParam ? eps.map((e) => e.closeDate) : sigs.map((s) => s.outcomeDate)) < NEW_SAMPLES_COOLDOWN)
      continue;

    const x = cur[param];
    const xs = [x, ...ladderNeighbors(param, x)];
    const stats = xs.map((v) => ({ x: v, stat: graders[param](v) }));
    const move = decideParam(stats[0], stats.slice(1));
    if (!move) continue;
    next[param] = move.x;
    const reason =
      `${samples} mẫu: x=${move.x} F1 ${f2(move.stat.f1)} (${move.stat.fired} lần hiện, đúng ${move.stat.matched}) ` +
      `vs hiện tại x=${x} F1 ${f2(stats[0].stat.f1)}`;
    moves.push({ param, from: x, to: move.x, reason, evidence: stats });
  }
  if (!moves.length) return [];

  // 1 transaction: mọi tune row + params mới — không nửa vời
  await prisma.$transaction([
    ...moves.map((m) =>
      prisma.adviceTune.create({
        data: {
          param: m.param,
          kind: "nudge",
          fromValue: m.from,
          toValue: m.to,
          params: JSON.stringify({ ...next, [m.param]: m.to }),
          reason: m.reason,
          evidence: JSON.stringify(m.evidence.map(statBrief)),
        },
      }),
    ),
    prisma.setting.upsert({
      where: { key: PARAMS_KEY },
      update: { value: JSON.stringify(next) },
      create: { key: PARAMS_KEY, value: JSON.stringify(next) },
    }),
  ]);
  cache = { at: Date.now(), v: next };

  await sendTelegram(
    [
      `🧠 <b>TỰ HỌC LỜI KHUYÊN/NHÃN</b>`,
      ...moves.map((m) => esc(`• ${PARAM_LABEL[m.param]}: ${m.from} → ${m.to} — ${m.reason}`)),
      `<i>Nguồn: ${eps.length} lệnh đã đóng ${TRADE_DAYS} ngày + ${sigs.length} gợi ý đã chấm ${LEARN_DAYS} ngày. Mỗi tham số chỉ dịch 1 bậc trong thang; xấu hơn thì nhịp sau tự dịch lại.</i>`,
    ].join("\n"),
    undefined,
    { kind: "system" },
  );
  return moves.map((m) => m.param);
}
