import { prisma } from "../prisma";
import { loadPortfolio } from "../report/portfolio";
import { positionsReport } from "../report/positions";
import { getQuote } from "../price";
import { userNum, NEED_USER, type AppUser } from "../user";
import { pos } from "../api";
import { estimatePlan, type PlanHolding, type PlanResult } from "./plan";

export type QuoteLike = { last: number | null; ref: number | null };

export type SignalForPlan = {
  id: number;
  ticker: string;
  sector: string | null;
  symbolId: number;
  entry: number;
  stop: number;
  target: number;
};

export type UserBook = {
  nav: number;
  cash: number;
  riskPct: number;
  holdings: PlanHolding[];
};

export type PersonalPlanDeps = {
  findSignal: (id: number) => Promise<SignalForPlan | null>;
  loadBook: (user: AppUser) => Promise<UserBook>;
  getQuote: (ticker: string) => Promise<QuoteLike>;
  avg20Value: (symbolId: number) => Promise<number | null>;
};

export type EntrySource = "query" | "quote" | "ref" | "signal";

export type PersonalPlanBody = PlanResult & {
  ticker: string;
  sector: string | null;
  entry: number;
  stop: number;
  target: number;
  entrySource: EntrySource;
  warnings: string[];
  informational: true;
};

const NO_TS = "Quote chưa có mốc thời gian.";

export function resolvePlanEntry(
  query: number | null,
  quote: QuoteLike | null,
  signalEntry: number,
): { entry: number; source: EntrySource; warnings: string[] } {
  const warnings: string[] = [];
  if (query != null) return { entry: query, source: "query", warnings };
  if (quote?.last != null && Number.isFinite(quote.last) && quote.last > 0) {
    warnings.push(`${NO_TS} Đang dùng giá khớp gần nhất.`);
    return { entry: quote.last, source: "quote", warnings };
  }
  if (quote?.ref != null && Number.isFinite(quote.ref) && quote.ref > 0) {
    warnings.push(`Đang dùng giá tham chiếu (chưa có giá khớp phiên). ${NO_TS}`);
    return { entry: quote.ref, source: "ref", warnings };
  }
  warnings.push(`Không lấy được giá live — dùng giá tham chiếu tín hiệu. ${NO_TS}`);
  return { entry: signalEntry, source: "signal", warnings };
}

export async function getPersonalSignalPlan(
  user: AppUser | null,
  signalId: number,
  query: { entry?: string | null; userId?: unknown },
  deps: PersonalPlanDeps,
): Promise<{ status: number; body: unknown }> {
  if (!user) return { status: 401, body: { error: NEED_USER } };
  if (!Number.isInteger(signalId) || signalId <= 0) return { status: 404, body: { error: "Không tìm thấy tín hiệu" } };

  const raw = query.entry;
  let entryQuery: number | null = null;
  if (raw != null && String(raw).trim() !== "") {
    const n = pos(raw);
    if (!n) return { status: 400, body: { error: "Giá mua không hợp lệ" } };
    entryQuery = n;
  }

  const sig = await deps.findSignal(signalId);
  if (!sig) return { status: 404, body: { error: "Không tìm thấy tín hiệu" } };

  const [book, quote, avg20] = await Promise.all([
    deps.loadBook(user),
    entryQuery != null ? Promise.resolve({ last: null, ref: null }) : deps.getQuote(sig.ticker),
    deps.avg20Value(sig.symbolId),
  ]);
  const { entry, source, warnings } = resolvePlanEntry(entryQuery, quote, sig.entry);
  const plan = estimatePlan({
    ticker: sig.ticker,
    sector: sig.sector,
    entry,
    stop: sig.stop,
    target: sig.target,
    nav: book.nav,
    cash: book.cash,
    riskPct: book.riskPct,
    avg20ValueVnd: avg20,
    holdings: book.holdings,
  });
  const body: PersonalPlanBody = {
    ...plan,
    ticker: sig.ticker,
    sector: sig.sector,
    entry,
    stop: sig.stop,
    target: sig.target,
    entrySource: source,
    warnings,
    informational: true,
  };
  return { status: 200, body };
}

export async function realPersonalPlanDeps(): Promise<PersonalPlanDeps> {
  return {
    findSignal: async (id) => {
      const s = await prisma.signal.findUnique({
        where: { id },
        select: {
          id: true,
          entry: true,
          stop: true,
          target: true,
          symbolId: true,
          symbol: { select: { ticker: true, sector: true } },
        },
      });
      if (!s) return null;
      return {
        id: s.id,
        ticker: s.symbol.ticker,
        sector: s.symbol.sector,
        symbolId: s.symbolId,
        entry: s.entry,
        stop: s.stop,
        target: s.target,
      };
    },
    loadBook: async (user) => {
      const lines = await positionsReport(user.id);
      const [pf, riskPct, symbols] = await Promise.all([
        loadPortfolio(lines, user),
        userNum(user, "riskPct"),
        prisma.symbol.findMany({
          where: { ticker: { in: [...new Set(lines.map((l) => l.ticker))] } },
          select: { ticker: true, sector: true },
        }),
      ]);
      const sectorOf = new Map(symbols.map((s) => [s.ticker, s.sector]));
      return {
        nav: pf.nav,
        cash: pf.cash,
        riskPct,
        holdings: lines.map((l) => ({
          ticker: l.ticker,
          sector: sectorOf.get(l.ticker) ?? null,
          qty: l.qty,
          entry: l.entry,
          price: l.price,
          stop: l.stop,
        })),
      };
    },
    getQuote,
    avg20Value: async (symbolId) => {
      const bars = await prisma.dailyBar.findMany({
        where: { symbolId },
        orderBy: { date: "desc" },
        take: 20,
        select: { value: true },
      });
      if (!bars.length) return null;
      return bars.reduce((s, b) => s + b.value, 0) / bars.length;
    },
  };
}
