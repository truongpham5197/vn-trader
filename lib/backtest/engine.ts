import type { Bar } from "../data/types";
import type { StrategyDef } from "../strategy/types";

export const ENGINE_VERSION = 2;

export interface BacktestConfig {
  params: Record<string, number>;
  fromDate?: string; // bars trước ngày này chỉ làm warmup, không sinh signal
  navVnd: number;
  riskPct: number;
  maxPositions: number;
  buyFeePct: number; // vd 0.0015
  sellFeePct: number; // 0.0015
  sellTaxPct: number; // 0.001
  slippagePct: number; // 0.002
  settleDays: number; // T+2
  /** New entries only. Held positions stay. */
  isEntryEligible?: (ticker: string, date: string) => boolean;
  /** Phần cuối equity curve dùng làm OOS (mặc định 0.3). */
  oosFraction?: number;
}

export const DEFAULT_BT_CONFIG = {
  navVnd: 500_000_000,
  riskPct: 0.01,
  maxPositions: 5,
  buyFeePct: 0.0015,
  sellFeePct: 0.0015,
  sellTaxPct: 0.001,
  slippagePct: 0.002,
  settleDays: 2,
  oosFraction: 0.3,
};

export const BACKTEST_LIMITATIONS: string[] = [
  "Nến ngày (OHLC): không có đường giá trong phiên — stop ưu tiên target cùng nến; khớp lệnh là xấp xỉ T+2.",
  "T+2: cổ phiếu/tiền bán chỉ khả dụng sau 2 phiên. Equity gồm khoản phải thu chưa settle. Hết kỳ không ép bán vị thế chưa đủ T+2 (để mở, mark-to-market).",
  "shouldExit (trailing/time-stop) đọc nến đóng cửa → bán phiên giao dịch kế tiếp, không khớp chính close đó.",
  "Mua LO không fill trên giá limit; từ chối gap thủng stop/buyZone; bỏ qua phiên nằm trần (khớp LO không thực tế).",
  "Biên độ trần/sàn (±7/10/15%): không mua trên trần, không bán dưới sàn.",
  "Universe liquid: thanh khoản as-of (TB GTGD 20 phiên tại từng ngày), không lấy 20 phiên mới nhất hiện tại.",
  "VN30: danh sách thành viên hiện tại (HOSE review T1/T7), không phải lịch sử rổ — có thiên lệch sống sót.",
];

export interface BtTrade {
  ticker: string;
  entryDate: string;
  exitDate?: string;
  qty: number;
  entry: number;
  exit?: number;
  pnl?: number;
  exitReason?: string;
  rMultiple?: number;
}

export interface BtMetrics {
  totalReturnPct: number;
  cagrPct: number;
  trades: number;
  winRatePct: number;
  avgR: number;
  profitFactor: number;
  maxDrawdownPct: number;
  exposurePct: number;
  skippedNoCash: number;
  skippedNoFill: number;
  closedTrades: number;
  openTrades: number;
  expectancyNet: number;
  openMtmPnl: number;
  benchmarkReturnPct: number;
  oosReturnPct: number;
  oosTrades: number;
  oosExpectancyNet: number;
  engineVersion: number;
}

export interface BtResult {
  metrics: BtMetrics;
  equity: { date: string; equity: number }[];
  trades: BtTrade[];
  limitations: string[];
}

interface Position {
  ticker: string;
  qty: number;
  entry: number;
  stop: number;
  target: number;
  entryIdx: number;
  eligibleIdx: number; // entryIdx + settleDays — T+2 mới bán được
  strategy: StrategyDef;
  params: Record<string, number>;
  bandPct: number;
}

interface PendingOrder {
  ticker: string;
  entry: number;
  stop: number;
  target: number;
  qty: number;
  signalIdx: number;
  strategy: StrategyDef;
  params: Record<string, number>;
  buyZone?: [number, number];
  bandPct: number;
}

const EPS = 1e-9;

function approxEq(a: number, b: number) {
  return Math.abs(a - b) < 1e-6;
}

function buyCost(fill: number, qty: number, cfg: BacktestConfig) {
  return fill * qty * 1000 * (1 + cfg.buyFeePct);
}

function sellProceeds(fill: number, qty: number, cfg: BacktestConfig) {
  return fill * qty * 1000 * (1 - cfg.sellFeePct - cfg.sellTaxPct);
}

function bandBounds(prevClose: number | undefined, bandPct: number) {
  if (prevClose == null) return null;
  return { ceiling: prevClose * (1 + bandPct), floor: prevClose * (1 - bandPct) };
}

function isLockedLimitUp(bar: Bar, bounds: { ceiling: number; floor: number } | null) {
  if (!bounds) return false;
  return (
    approxEq(bar.open, bar.high) &&
    approxEq(bar.high, bar.low) &&
    approxEq(bar.low, bar.close) &&
    bar.close >= bounds.ceiling - EPS
  );
}

/** Limit buy: never above limit; reject gap through stop/zone; skip lock-up; respect ceiling. */
export function limitBuyFill(
  bar: Bar,
  limit: number,
  stop: number,
  buyZone: [number, number] | undefined,
  slippagePct: number,
  prevClose: number | undefined,
  bandPct: number,
): number | null {
  if (bar.low > limit + EPS) return null;
  const bounds = bandBounds(prevClose, bandPct);
  if (isLockedLimitUp(bar, bounds)) return null;

  let fill = bar.open <= limit + EPS ? bar.open : limit;
  fill = Math.min(fill * (1 + slippagePct), limit);

  if (bounds && fill > bounds.ceiling + EPS) return null;
  if (fill < stop - EPS) return null;
  if (buyZone && (fill < buyZone[0] - EPS || fill > buyZone[1] + EPS)) return null;
  return fill;
}

function sellFill(raw: number, slippagePct: number, floor?: number) {
  const fill = raw * (1 - slippagePct);
  return floor != null ? Math.max(fill, floor) : fill;
}

export function equalWeightBuyHoldReturn(
  barsByTicker: Map<string, Bar[]>,
  cfg: Pick<BacktestConfig, "navVnd" | "buyFeePct" | "sellFeePct" | "sellTaxPct" | "slippagePct" | "fromDate">,
  isEntryEligible?: (ticker: string, date: string) => boolean,
): number {
  const dateSet = new Set<string>();
  for (const bars of barsByTicker.values()) for (const b of bars) dateSet.add(b.date);
  const dates = [...dateSet].sort().filter((d) => !cfg.fromDate || d >= cfg.fromDate);
  if (dates.length < 2) return 0;
  const first = dates[0];
  const last = dates[dates.length - 1];

  const names: string[] = [];
  for (const [ticker, bars] of barsByTicker) {
    if (isEntryEligible && !isEntryEligible(ticker, first)) continue;
    if (bars.some((b) => b.date === first) && bars.some((b) => b.date === last)) names.push(ticker);
  }
  if (!names.length) return 0;

  const alloc = cfg.navVnd / names.length;
  let end = 0;
  for (const ticker of names) {
    const bars = barsByTicker.get(ticker)!;
    const b0 = bars.find((b) => b.date === first)!;
    const b1 = bars.find((b) => b.date === last)!;
    const buyPx = b0.close * (1 + cfg.slippagePct);
    const qty = Math.floor(alloc / (buyPx * 1000 * (1 + cfg.buyFeePct)) / 100) * 100;
    if (qty <= 0) continue;
    const cost = buyCost(buyPx, qty, cfg as BacktestConfig);
    const sellPx = b1.close * (1 - cfg.slippagePct);
    end += sellProceeds(sellPx, qty, cfg as BacktestConfig) + (alloc - cost);
  }
  return ((end - cfg.navVnd) / cfg.navVnd) * 100;
}

function closedMetrics(closed: BtTrade[]) {
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0);
  const grossWin = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(
    closed.filter((t) => (t.pnl ?? 0) <= 0).reduce((s, t) => s + (t.pnl ?? 0), 0),
  );
  return {
    winRatePct: closed.length ? (wins.length / closed.length) * 100 : 0,
    avgR: closed.length ? closed.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / closed.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    expectancyNet: closed.length ? closed.reduce((s, t) => s + (t.pnl ?? 0), 0) / closed.length : 0,
  };
}

/**
 * Backtest portfolio-level, event-driven theo ngày:
 * settle tiền → exits → fills → (hết kỳ thanh lý nếu đủ T+2) → mark-to-market (gồm phải thu) → signals.
 * Luật VN: T+2 (tiền lẫn cổ phiếu), lot 100, phí+thuế, slippage, band, LO.
 */
export function runBacktest(
  barsByTicker: Map<string, Bar[]>,
  bandPctByTicker: Map<string, number>,
  strategy: StrategyDef,
  cfg: BacktestConfig,
): BtResult {
  const dateSet = new Set<string>();
  for (const bars of barsByTicker.values()) for (const b of bars) dateSet.add(b.date);
  const allDates = [...dateSet].sort();

  const barMaps = new Map<string, Map<string, { bar: Bar; idx: number }>>();
  for (const [t, bars] of barsByTicker) {
    const m = new Map<string, { bar: Bar; idx: number }>();
    bars.forEach((bar, idx) => m.set(bar.date, { bar, idx }));
    barMaps.set(t, m);
  }

  let cash = cfg.navVnd;
  const settlements = new Map<number, number>(); // idx ngày về tiền → amount
  const positions = new Map<string, Position>();
  const pendingExits = new Map<string, { reason: string; signalIdx: number }>(); // bán phiên sau tín hiệu
  let pending: PendingOrder[] = [];
  const trades: BtTrade[] = [];
  const equityCurve: { date: string; equity: number }[] = [];
  let skippedNoCash = 0;
  let skippedNoFill = 0;
  let daysWithPositions = 0;

  const sizeFor = (equity: number, cashAvail: number, entry: number, stop: number) => {
    const perShareRisk = (entry - stop) * 1000;
    if (perShareRisk <= 0) return 0;
    const riskQty = Math.floor((equity * cfg.riskPct) / perShareRisk / 100) * 100;
    const affordQty = Math.floor(cashAvail / (entry * 1000 * (1 + cfg.buyFeePct)) / 100) * 100;
    return Math.min(riskQty, affordQty);
  };

  const receivables = () => {
    let s = 0;
    for (const v of settlements.values()) s += v;
    return s;
  };

  const closePosition = (
    pos: Position,
    date: string,
    i: number,
    fill: number,
    reason: string,
  ) => {
    const proceeds = sellProceeds(fill, pos.qty, cfg);
    settlements.set(i + cfg.settleDays, (settlements.get(i + cfg.settleDays) ?? 0) + proceeds);
    const cost = buyCost(pos.entry, pos.qty, cfg);
    const pnl = proceeds - cost;
    const risk = (pos.entry - pos.stop) * pos.qty * 1000;
    trades.push({
      ticker: pos.ticker,
      entryDate: allDates[pos.entryIdx],
      exitDate: date,
      qty: pos.qty,
      entry: pos.entry,
      exit: fill,
      pnl,
      exitReason: reason,
      rMultiple: risk > 0 ? pnl / risk : 0,
    });
    positions.delete(pos.ticker);
    pendingExits.delete(pos.ticker);
  };

  const prevCloseOf = (ticker: string, bm: { bar: Bar; idx: number }) => {
    const bars = barsByTicker.get(ticker);
    return bm.idx > 0 && bars ? bars[bm.idx - 1].close : undefined;
  };

  for (let i = 0; i < allDates.length; i++) {
    const date = allDates[i];
    if (cfg.fromDate && date < cfg.fromDate) continue;
    const lastDay = i === allDates.length - 1;

    const settled = settlements.get(i);
    if (settled) {
      cash += settled;
      settlements.delete(i);
    }

    for (const [ticker, pos] of [...positions]) {
      const bm = barMaps.get(ticker)?.get(date);
      if (!bm) continue;
      const { bar, idx } = bm;
      const bars = barsByTicker.get(ticker)!.slice(0, idx + 1);
      const bounds = bandBounds(prevCloseOf(ticker, bm), pos.bandPct);
      const floor = bounds?.floor;

      let exitPrice: number | null = null;
      let exitReason: string | null = null;
      const scheduled = pendingExits.get(ticker);

      if (pos.eligibleIdx <= i) {
        if (bar.low <= pos.stop) {
          exitPrice = sellFill(Math.min(bar.open, pos.stop), cfg.slippagePct, floor);
          exitReason = "stop";
        } else if (bar.high >= pos.target) {
          exitPrice = sellFill(pos.target, cfg.slippagePct, floor);
          exitReason = "target";
        } else if (scheduled && scheduled.signalIdx < i) {
          exitPrice = sellFill(bar.open, cfg.slippagePct, floor);
          exitReason = scheduled.reason;
        }
      }

      if (exitPrice !== null && exitReason) {
        closePosition(pos, date, i, exitPrice, exitReason);
        continue;
      }

      if (!scheduled && pos.strategy.shouldExit) {
        const reason = pos.strategy.shouldExit({
          bars,
          entryPrice: pos.entry,
          daysHeld: i - pos.entryIdx,
          params: pos.params,
        });
        if (reason) pendingExits.set(ticker, { reason, signalIdx: i });
      }
    }

    const stillPending: PendingOrder[] = [];
    for (const po of pending) {
      if (po.signalIdx !== i - 1) {
        if (po.signalIdx < i - 1) skippedNoFill++;
        else stillPending.push(po);
        continue;
      }
      const bm = barMaps.get(po.ticker)?.get(date);
      if (!bm) {
        skippedNoFill++;
        continue;
      }
      const fill = limitBuyFill(
        bm.bar,
        po.entry,
        po.stop,
        po.buyZone,
        cfg.slippagePct,
        prevCloseOf(po.ticker, bm),
        po.bandPct,
      );
      if (fill == null) {
        skippedNoFill++;
        continue;
      }
      if (positions.size >= cfg.maxPositions) {
        skippedNoCash++;
        continue;
      }
      const cost = buyCost(fill, po.qty, cfg);
      if (cost > cash) {
        skippedNoCash++;
        continue;
      }
      cash -= cost;
      positions.set(po.ticker, {
        ticker: po.ticker,
        qty: po.qty,
        entry: fill,
        stop: po.stop,
        target: po.target,
        entryIdx: i,
        eligibleIdx: i + cfg.settleDays,
        strategy: po.strategy,
        params: po.params,
        bandPct: po.bandPct,
      });
    }
    pending = stillPending;

    const heldToday = positions.size > 0;
    if (lastDay) {
      for (const pos of [...positions.values()]) {
        if (pos.eligibleIdx > i) continue;
        const bm = barMaps.get(pos.ticker)?.get(date);
        const closePx = bm?.bar.close ?? pos.entry;
        const bounds = bm ? bandBounds(prevCloseOf(pos.ticker, bm), pos.bandPct) : null;
        const fill = sellFill(closePx, cfg.slippagePct, bounds?.floor);
        closePosition(pos, date, i, fill, "end-of-test");
      }
    }

    let equity = cash + receivables();
    for (const pos of positions.values()) {
      const bm = barMaps.get(pos.ticker)?.get(date);
      equity += pos.qty * (bm?.bar.close ?? pos.entry) * 1000;
    }
    if (heldToday) daysWithPositions++;

    if (positions.size < cfg.maxPositions) {
      for (const [ticker, bm] of barMaps) {
        if (positions.has(ticker) || pending.some((p) => p.ticker === ticker)) continue;
        if (cfg.isEntryEligible && !cfg.isEntryEligible(ticker, date)) continue;
        const t = bm.get(date);
        if (!t) continue;
        const bars = barsByTicker.get(ticker)!.slice(0, t.idx + 1);
        const bandPct = bandPctByTicker.get(ticker) ?? 0.07;
        const cand = strategy.fn({
          ticker,
          exchange: ticker,
          bandPct,
          bars,
          params: { ...strategy.defaults, ...cfg.params },
        });
        if (!cand) continue;
        const qty = sizeFor(equity, cash, cand.entry, cand.stop);
        if (qty <= 0) continue;
        pending.push({
          ticker,
          entry: cand.entry,
          stop: cand.stop,
          target: cand.target,
          qty,
          signalIdx: i,
          strategy,
          params: { ...strategy.defaults, ...cfg.params },
          buyZone: cand.buyZone,
          bandPct,
        });
      }
    }

    equityCurve.push({ date, equity });
  }

  let openMtmPnl = 0;
  for (const pos of positions.values()) {
    const bars = barsByTicker.get(pos.ticker)!;
    const lastBar = bars[bars.length - 1];
    const mtm = pos.qty * lastBar.close * 1000;
    const cost = buyCost(pos.entry, pos.qty, cfg);
    openMtmPnl += mtm - cost;
    trades.push({
      ticker: pos.ticker,
      entryDate: allDates[pos.entryIdx],
      qty: pos.qty,
      entry: pos.entry,
      exitReason: "open",
    });
  }

  const first = equityCurve[0]?.equity ?? cfg.navVnd;
  const last = equityCurve[equityCurve.length - 1]?.equity ?? cfg.navVnd;
  const days = Math.max(equityCurve.length, 1);
  const closed = trades.filter((t) => t.exitDate);
  const open = trades.filter((t) => !t.exitDate);
  const cm = closedMetrics(closed);

  let peak = -Infinity;
  let maxDD = 0;
  for (const p of equityCurve) {
    peak = Math.max(peak, p.equity);
    maxDD = Math.max(maxDD, (peak - p.equity) / peak);
  }

  const oosFraction = cfg.oosFraction ?? DEFAULT_BT_CONFIG.oosFraction;
  const splitIdx = Math.max(0, Math.floor(equityCurve.length * (1 - oosFraction)));
  const eqSplit = equityCurve[splitIdx]?.equity ?? first;
  const splitDate = equityCurve[splitIdx]?.date;
  const oosTrades = splitDate ? closed.filter((t) => t.entryDate >= splitDate) : [];
  const oosCm = closedMetrics(oosTrades);

  return {
    metrics: {
      totalReturnPct: first ? ((last - first) / first) * 100 : 0,
      cagrPct: first > 0 ? (Math.pow(last / first, 252 / days) - 1) * 100 : 0,
      trades: closed.length,
      winRatePct: cm.winRatePct,
      avgR: cm.avgR,
      profitFactor: cm.profitFactor,
      maxDrawdownPct: maxDD * 100,
      exposurePct: (daysWithPositions / days) * 100,
      skippedNoCash,
      skippedNoFill,
      closedTrades: closed.length,
      openTrades: open.length,
      expectancyNet: cm.expectancyNet,
      openMtmPnl,
      benchmarkReturnPct: equalWeightBuyHoldReturn(barsByTicker, cfg, cfg.isEntryEligible),
      oosReturnPct: eqSplit ? ((last - eqSplit) / eqSplit) * 100 : 0,
      oosTrades: oosTrades.length,
      oosExpectancyNet: oosCm.expectancyNet,
      engineVersion: ENGINE_VERSION,
    },
    equity: equityCurve,
    trades,
    limitations: BACKTEST_LIMITATIONS,
  };
}
