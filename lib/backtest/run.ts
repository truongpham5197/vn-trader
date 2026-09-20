import { prisma } from "../prisma";
import { STRATEGIES } from "../strategy";
import { runBacktest, DEFAULT_BT_CONFIG, type BacktestConfig, type BtResult } from "./engine";
import type { Bar } from "../data/types";

export const VN30 = [
  "ACB", "BID", "BVH", "CTG", "FPT", "GAS", "GVR", "HDB", "HPG", "KDH",
  "LPB", "MBB", "MSN", "MWG", "PLX", "SAB", "SSB", "SSI", "STB", "TCB",
  "TPB", "VCB", "VHM", "VIB", "VIC", "VJC", "VNM", "VPB", "VRE", "SHB",
];

const WARMUP_DAYS = 150;

export async function resolveUniverse(
  universe: string,
  minValueVnd: number,
): Promise<string[]> {
  if (universe === "vn30") return VN30;
  if (universe === "all") {
    const s = await prisma.symbol.findMany({ where: { active: true }, select: { ticker: true } });
    return s.map((x) => x.ticker);
  }
  // "liquid": avg value 20 phiên gần nhất >= minValue
  const symbols = await prisma.symbol.findMany({
    where: { active: true },
    select: { id: true, ticker: true },
  });
  const out: string[] = [];
  for (const s of symbols) {
    const bars = await prisma.dailyBar.findMany({
      where: { symbolId: s.id },
      orderBy: { date: "desc" },
      take: 20,
      select: { value: true },
    });
    if (bars.length < 20) continue;
    const avg = bars.reduce((x, b) => x + b.value, 0) / bars.length;
    if (avg >= minValueVnd) out.push(s.ticker);
  }
  return out;
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
  const idByTicker = new Map(symbols.map((s) => [s.ticker, s.id]));
  const bandPct = new Map(symbols.map((s) => [s.ticker, s.bandPct]));

  const barsByTicker = new Map<string, Bar[]>();
  const rows = await prisma.dailyBar.findMany({
    where: {
      symbolId: { in: symbols.map((s) => s.id) },
      date: { gte: warmupFrom, lte: opts.toDate },
    },
    orderBy: [{ symbolId: "asc" }, { date: "asc" }],
  });
  for (const r of rows) {
    const t = symbols.find((s) => s.id === r.symbolId)!.ticker;
    const arr = barsByTicker.get(t) ?? [];
    arr.push({
      date: r.date,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
    });
    barsByTicker.set(t, arr);
  }
  void idByTicker;

  const cfg: BacktestConfig = {
    ...DEFAULT_BT_CONFIG,
    params: opts.params ?? {},
    fromDate: opts.fromDate,
    ...opts.overrides,
  };
  const result = runBacktest(barsByTicker, bandPct, strategy, cfg);

  const run = await prisma.backtestRun.create({
    data: {
      strategyType: opts.strategyType,
      params: JSON.stringify(cfg.params),
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
