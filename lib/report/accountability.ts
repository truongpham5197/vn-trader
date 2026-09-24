import { prisma } from "../prisma";
import { STRATEGIES } from "../strategy";
import { personaById, pickPersona, variantOf, PERSONAS } from "../persona";
import { positionsReport } from "./positions";
import { loadPortfolio } from "./portfolio";
import { userNum, type AppUser } from "../user";
import { sendTelegram } from "../telegram/notify";
import { pushAlert } from "../alerts";
import { getSetting, setSetting } from "../settings";
import { addCalendarDays } from "./signal-evidence";
import { FILL_SESSIONS, HOLD_SESSIONS, outcomeStats, resolveOutcome, type Outcome, type OutcomeStats } from "./signal-outcome";
import { buildDigest, type DigestGraded } from "./personal-digest";

export const RECORD_DAYS = 120;
const MAX_WINDOW = FILL_SESSIONS + Math.max(...Object.values(HOLD_SESSIONS)) + 2;

/** Chấm điểm gợi ý chưa có kết quả trong RECORD_DAYS ngày. Trả về id vừa chốt. */
export async function gradeSignals(today: string): Promise<number[]> {
  const rows = await prisma.signal.findMany({
    where: { outcome: null, date: { gte: addCalendarDays(today, -RECORD_DAYS) } },
    select: { id: true, symbolId: true, date: true, entry: true, stop: true, target: true, buyHigh: true, strategy: { select: { type: true } } },
    orderBy: { date: "asc" },
  });
  if (!rows.length) return [];
  const bars = await prisma.dailyBar.findMany({
    where: { symbolId: { in: [...new Set(rows.map((r) => r.symbolId))] }, date: { gt: rows[0].date } },
    select: { symbolId: true, date: true, open: true, high: true, low: true, close: true },
    orderBy: { date: "asc" },
  });
  const bySym = new Map<number, typeof bars>();
  for (const b of bars) bySym.set(b.symbolId, [...(bySym.get(b.symbolId) ?? []), b]);

  const updates = [];
  for (const r of rows) {
    const after = (bySym.get(r.symbolId) ?? []).filter((b) => b.date > r.date).slice(0, MAX_WINDOW);
    const o = resolveOutcome({ ...r, strategyType: r.strategy.type }, after);
    if (!o) continue;
    updates.push({ id: r.id, data: { outcome: o.outcome, outcomePct: o.pct, outcomeR: o.r, outcomeDate: o.date, fillPrice: o.fill, exitPrice: o.exit } });
  }
  for (let i = 0; i < updates.length; i += 50) {
    await prisma.$transaction(updates.slice(i, i + 50).map((u) => prisma.signal.update({ where: { id: u.id }, data: u.data })));
  }
  return updates.map((u) => u.id);
}

/** Thành tích gợi ý thật theo chiến lược (RECORD_DAYS ngày). */
export async function strategyRecords(today: string): Promise<Record<string, OutcomeStats>> {
  const rows = await prisma.signal.findMany({
    where: { outcome: { not: null }, date: { gte: addCalendarDays(today, -RECORD_DAYS) } },
    select: { outcome: true, outcomePct: true, outcomeR: true, strategy: { select: { type: true } } },
  });
  const by = new Map<string, typeof rows>();
  for (const r of rows) by.set(r.strategy.type, [...(by.get(r.strategy.type) ?? []), r]);
  return Object.fromEntries([...by].map(([t, xs]) => [t, outcomeStats(xs)]));
}

/** Gán phong cách mặc định cho user chưa có — trải đều (ít người dùng nhất trước). User tự đổi trùng được. */
export async function ensurePersonas(): Promise<void> {
  const users = await prisma.user.findMany({ select: { id: true, persona: true }, orderBy: { id: "asc" } });
  const used = users.map((u) => u.persona);
  for (const u of users) {
    if (u.persona && PERSONAS.some((p) => p.id === u.persona)) continue;
    const id = pickPersona(used, u.id);
    used.push(id);
    await prisma.user.update({ where: { id: u.id }, data: { persona: id } });
  }
}

/** Mã đang giữ (theo tín hiệu gốc) phạm luật thoát của chiến lược — đọc nến đã đóng. */
async function exitHits(trades: { symbolId: number; ticker: string; openedAt: Date; strategy: string | null }[]) {
  const out: { ticker: string; reason: string }[] = [];
  for (const t of trades) {
    const def = t.strategy ? STRATEGIES[t.strategy] : undefined;
    if (!def?.shouldExit) continue;
    const rows = await prisma.dailyBar.findMany({ where: { symbolId: t.symbolId }, orderBy: { date: "desc" }, take: 80 });
    if (rows.length < 20) continue;
    const bars = rows.reverse().map((r) => ({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume }));
    const opened = t.openedAt.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const reason = def.shouldExit({ bars, entryPrice: 0, daysHeld: bars.filter((b) => b.date > opened).length, params: def.defaults });
    if (reason) out.push({ ticker: t.ticker, reason: EXIT_TEXT[reason] ?? reason });
  }
  return out;
}

const EXIT_TEXT: Record<string, string> = {
  "trailing-ma10": "đóng cửa dưới MA10",
  "close<ma50": "đóng cửa dưới MA50, xu hướng gãy",
  "rsi-revert-exit": "RSI2 đã hồi trên 70",
  "time-stop": "giữ quá số phiên của chiến lược",
};

/**
 * Sau scan: chấm gợi ý cũ + gửi mỗi user 1 tin riêng (giọng riêng, xếp theo rổ đang giữ).
 * 1 lần/phiên nến (Setting digestDate) — scan chạy lại không gửi lại.
 */
export async function sendPersonalDigests(date: string, today: string, newly: number[], records: Record<string, OutcomeStats>): Promise<number> {
  if ((await getSetting("digestDate")) === date) return 0;
  await setSetting("digestDate", date);
  await ensurePersonas();
  const [users, signals, graded] = await Promise.all([
    prisma.user.findMany({ select: { id: true, username: true, owner: true, navVnd: true, riskPct: true, watchlist: true, persona: true } }),
    prisma.signal.findMany({
      where: { date, status: { in: ["new", "notified", "taken", "filled"] } },
      include: { symbol: { select: { ticker: true, sector: true } }, strategy: { select: { type: true } } },
    }),
    prisma.signal.findMany({
      where: { id: { in: newly }, outcomeDate: { gte: addCalendarDays(today, -4) }, status: { not: "skipped" } },
      select: { id: true, date: true, outcome: true, outcomePct: true, symbol: { select: { ticker: true } }, strategy: { select: { type: true } } },
    }),
  ]);
  const digestSignals = signals.map((s) => ({
    id: s.id,
    ticker: s.symbol.ticker,
    sector: s.symbol.sector,
    strategy: s.strategy.type,
    entry: s.entry,
    stop: s.stop,
    target: s.target,
    rr: s.rr,
    buyZone: s.buyLow !== null && s.buyHigh !== null ? ([s.buyLow, s.buyHigh] as [number, number]) : null,
    reason: s.reason,
  }));

  let sent = 0;
  for (const u of users) {
    try {
      const user: AppUser = u;
      const [lines, trades] = await Promise.all([
        positionsReport(u.id),
        prisma.trade.findMany({
          where: { userId: u.id, OR: [{ status: "open" }, { signalId: { in: graded.map((g) => g.id) } }] },
          select: { status: true, symbolId: true, openedAt: true, signalId: true, symbol: { select: { ticker: true, sector: true } }, signal: { select: { strategy: { select: { type: true } } } } },
        }),
      ]);
      const open = trades.filter((t) => t.status === "open");
      const [pf, riskPct, exits] = await Promise.all([
        loadPortfolio(lines, user),
        userNum(user, "riskPct"),
        exitHits(open.map((t) => ({ symbolId: t.symbolId, ticker: t.symbol.ticker, openedAt: t.openedAt, strategy: t.signal?.strategy.type ?? null }))),
      ]);
      const takenIds = new Set(trades.map((t) => t.signalId));
      const sectorOf = new Map(open.map((t) => [t.symbol.ticker, t.symbol.sector]));
      const text = buildDigest({
        persona: personaById(u.persona),
        variant: variantOf(users, u.id, personaById(u.persona).id),
        name: u.username,
        seed: date,
        signals: digestSignals,
        holdings: lines.map((l) => ({ ticker: l.ticker, sector: sectorOf.get(l.ticker) ?? null, price: l.price, stop: l.stop })),
        watchlist: u.watchlist,
        nav: pf.nav,
        cash: pf.cash,
        riskPct,
        records,
        graded: graded.map(
          (g): DigestGraded => ({ ticker: g.symbol.ticker, strategy: g.strategy.type, date: g.date, outcome: g.outcome as Outcome, pct: g.outcomePct, taken: takenIds.has(g.id) }),
        ),
        exits,
      });
      if (!text) continue;
      if (u.owner) await sendTelegram(text, undefined, { kind: "signal", userId: u.id });
      else await pushAlert(text, { kind: "signal", userId: u.id });
      sent++;
    } catch (e) {
      console.error("[digest]", u.id, e);
    }
  }
  return sent;
}
