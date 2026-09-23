import { prisma } from "../prisma";
import { STRATEGIES } from "../strategy";
import { runBacktest, DEFAULT_BT_CONFIG, type BacktestConfig, type BtResult } from "./engine";
import type { Bar } from "../data/types";
import { VN30_TICKERS, makeAsOfLiquidFilter, type ValueBar } from "./universe";
import { serializeRunParams } from "./report";

/** @deprecated dùng VN30_TICKERS — list hiện tại, không phải lịch sử rổ. */
export const VN30 = VN30_TICKERS;

const WARMUP_DAYS = 150;

/**
 * Tập mã nạp bars. liquid = mọi mã active (lọc thanh khoản as-of từng ngày trong engine),
 * không lấy 20 phiên mới nhất hiện tại.
 */
export async function resolveUniverse(
  universe: string,
  _minValueVnd: number,
): Promise<string[]> {
  if (universe === "vn30") return [...VN30_TICKERS];
  const s = await prisma.symbol.findMany({ where: { active: true }, select: { ticker: true } });
  return s.map((x) => x.ticker);
}

export async function runBacktestFromDb(opts: {
  strategyType: string;
  params?: Record<string, number>;
  universe: string;
  fromDate: string;
  toDate: string;
  overrides?: Partial<BacktestConfig>;
}): Promise<{ runId: number; result: BtResult }> {
  const strategy = STRATEGIES[opts.strategyType];
  if (!strategy) throw new Error(`Unknown strategy: ${opts.strategyType}`);

  const minValue = await prisma.setting
    .findUnique({ where: { key: "universeMinValueVnd" } })
    .then((r) => Number(r?.value ?? 5e9));

  const tickers = await resolveUniverse(opts.universe, minValue);

  const warmupFrom = new Date(
    new Date(opts.fromDate).getTime() - WARMUP_DAYS * 24 * 3600 * 1000,
  )
    .toISOString()
    .slice(0, 10);

  const symbols = await prisma.symbol.findMany({
    where: { ticker: { in: tickers } },
    select: { id: true, ticker: true, bandPct: true },
  });
  const bandPct = new Map(symbols.map((s) => [s.ticker, s.bandPct]));
  const tickerById = new Map(symbols.map((s) => [s.id, s.ticker]));

  const barsByTicker = new Map<string, ValueBar[]>();
  const rows = await prisma.dailyBar.findMany({
    where: {
      symbolId: { in: symbols.map((s) => s.id) },
      date: { gte: warmupFrom, lte: opts.toDate },
    },
    orderBy: [{ symbolId: "asc" }, { date: "asc" }],
  });
  for (const r of rows) {
    const t = tickerById.get(r.symbolId);
    if (!t) continue;
    const arr = barsByTicker.get(t) ?? [];
    arr.push({
      date: r.date,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      value: r.value,
    });
    barsByTicker.set(t, arr);
  }

  const cfg: BacktestConfig = {
    ...DEFAULT_BT_CONFIG,
    params: opts.params ?? {},
    fromDate: opts.fromDate,
    ...opts.overrides,
  };
  if (opts.universe === "liquid") {
    cfg.isEntryEligible = makeAsOfLiquidFilter(barsByTicker, minValue);
  }
  const result = runBacktest(barsByTicker as Map<string, Bar[]>, bandPct, strategy, cfg);

  const run = await prisma.backtestRun.create({
    data: {
      strategyType: opts.strategyType,
      params: serializeRunParams({
        strategyParams: cfg.params,
        cfg,
        universe: opts.universe,
        fromDate: opts.fromDate,
        toDate: opts.toDate,
      }),
      universe: `${opts.universe}(${tickers.length})`,
      periodStart: opts.fromDate,
      periodEnd: opts.toDate,
      metrics: JSON.stringify(result.metrics),
      equity: JSON.stringify(result.equity),
      trades: JSON.stringify(result.trades),
    },
  });
  return { runId: run.id, result };
}
