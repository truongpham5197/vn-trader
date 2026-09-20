import type { Bar } from "../data/types";
import type { StrategyDef } from "../strategy/types";

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
};

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

export interface BtResult {
  metrics: {
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
  };
  equity: { date: string; equity: number }[];
  trades: BtTrade[];
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
}

/**
 * Backtest portfolio-level, event-driven theo ngày:
 * settle tiền → exits → fills → signals → mark-to-market.
 * Luật VN: T+2 (tiền lẫn cổ phiếu), lot 100, phí+thuế, slippage.
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
    // cap theo tiền mặt khả dụng — stop hẹp có thể cho qty vượt NAV
    const affordQty = Math.floor(cashAvail / (entry * 1000 * (1 + cfg.buyFeePct)) / 100) * 100;
    return Math.min(riskQty, affordQty);
  };

  for (let i = 0; i < allDates.length; i++) {
    const date = allDates[i];
    if (cfg.fromDate && date < cfg.fromDate) continue; // warmup only

    // 1. Tiền bán T+2 về
    const settled = settlements.get(i);
    if (settled) {
      cash += settled;
      settlements.delete(i);
    }

    // 2. Exits — chỉ khi CP đã settle (eligibleIdx <= i)
    for (const [ticker, pos] of [...positions]) {
      if (pos.eligibleIdx > i) continue;
      const bm = barMaps.get(ticker)?.get(date);
      if (!bm) continue;
      const { bar, idx } = bm;
      const bars = barsByTicker.get(ticker)!.slice(0, idx + 1);

      let exitPrice: number | null = null;
      let exitReason: string | null = null;

      // Conservative: stop check trước target trong cùng phiên
      if (bar.low <= pos.stop) {
        exitPrice = Math.min(bar.open, pos.stop); // gap mở cửa dưới stop → khớp open
        exitReason = "stop";
      } else if (bar.high >= pos.target) {
        exitPrice = pos.target;
        exitReason = "target";
      } else if (pos.strategy.shouldExit) {
        exitReason = pos.strategy.shouldExit({
          bars,
          entryPrice: pos.entry,
          daysHeld: i - pos.entryIdx,
          params: pos.params,
        });
        if (exitReason) exitPrice = bar.close; // rule exit khớp theo close
      }

      if (exitPrice !== null && exitReason) {
        const fill = exitPrice * (1 - cfg.slippagePct);
        const proceeds = fill * pos.qty * 1000 * (1 - cfg.sellFeePct - cfg.sellTaxPct);
        settlements.set(i + cfg.settleDays, (settlements.get(i + cfg.settleDays) ?? 0) + proceeds);
        const cost = pos.entry * pos.qty * 1000 * (1 + cfg.buyFeePct);
        const pnl = proceeds - cost;
        trades.push({
          ticker,
          entryDate: allDates[pos.entryIdx],
          exitDate: date,
          qty: pos.qty,
          entry: pos.entry,
          exit: fill,
          pnl,
          exitReason,
          rMultiple: pnl / ((pos.entry - pos.stop) * pos.qty * 1000),
        });
        positions.delete(ticker);
      }
    }

    // 3. Fill pending entries (đặt từ phiên trước, hết hạn sau 1 phiên)
    const stillPending: PendingOrder[] = [];
    for (const po of pending) {
      if (po.signalIdx !== i - 1) {
        stillPending.push(po); // signal từ phiên trước mới xử lý
        continue;
      }
      const bm = barMaps.get(po.ticker)?.get(date);
      if (!bm || bm.bar.low > po.entry) {
        skippedNoFill++;
        continue; // không chạm giá entry → hủy lệnh
      }
      if (positions.size >= cfg.maxPositions) {
        skippedNoCash++;
        continue;
      }
      const fill = Math.min(bm.bar.open, po.entry) * (1 + cfg.slippagePct);
      const cost = fill * po.qty * 1000 * (1 + cfg.buyFeePct);
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
      });
    }
    pending = stillPending;

    // 4. Mark-to-market + signals EOD → pending cho phiên sau
    let equity = cash;
    for (const pos of positions.values()) {
      const bm = barMaps.get(pos.ticker)?.get(date);
      equity += pos.qty * (bm?.bar.close ?? pos.entry) * 1000;
    }
    if (positions.size > 0) daysWithPositions++;

    if (positions.size < cfg.maxPositions) {
      for (const [ticker, bm] of barMaps) {
        if (positions.has(ticker) || pending.some((p) => p.ticker === ticker)) continue;
        const t = bm.get(date);
        if (!t) continue;
        const bars = barsByTicker.get(ticker)!.slice(0, t.idx + 1);
        const cand = strategy.fn({
          ticker,
          exchange: ticker,
          bandPct: bandPctByTicker.get(ticker) ?? 0.07,
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
        });
      }
    }

    equityCurve.push({ date, equity });
  }

  // Đóng nốt positions cuối kỳ theo close cuối
  for (const [, pos] of positions) {
    const bars = barsByTicker.get(pos.ticker)!;
    const lastBar = bars[bars.length - 1];
    const fill = lastBar.close * (1 - cfg.slippagePct);
    const proceeds = fill * pos.qty * 1000 * (1 - cfg.sellFeePct - cfg.sellTaxPct);
    const cost = pos.entry * pos.qty * 1000 * (1 + cfg.buyFeePct);
    trades.push({
      ticker: pos.ticker,
      entryDate: allDates[pos.entryIdx],
      exitDate: lastBar.date,
      qty: pos.qty,
      entry: pos.entry,
      exit: fill,
      pnl: proceeds - cost,
      exitReason: "end-of-test",
      rMultiple: (proceeds - cost) / ((pos.entry - pos.stop) * pos.qty * 1000),
    });
  }

  const first = equityCurve[0]?.equity ?? cfg.navVnd;
  const last = equityCurve[equityCurve.length - 1]?.equity ?? cfg.navVnd;
  const days = Math.max(equityCurve.length, 1);
  const wins = trades.filter((t) => (t.pnl ?? 0) > 0);
  const grossWin = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(
    trades.filter((t) => (t.pnl ?? 0) <= 0).reduce((s, t) => s + (t.pnl ?? 0), 0),
  );
  let peak = -Infinity;
  let maxDD = 0;
  for (const p of equityCurve) {
    peak = Math.max(peak, p.equity);
    maxDD = Math.max(maxDD, (peak - p.equity) / peak);
  }

  return {
    metrics: {
      totalReturnPct: ((last - first) / first) * 100,
      cagrPct: (Math.pow(last / first, 252 / days) - 1) * 100,
      trades: trades.length,
      winRatePct: trades.length ? (wins.length / trades.length) * 100 : 0,
      avgR: trades.length
        ? trades.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / trades.length
        : 0,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
      maxDrawdownPct: maxDD * 100,
      exposurePct: (daysWithPositions / days) * 100,
      skippedNoCash,
      skippedNoFill,
    },
    equity: equityCurve,
    trades,
  };
}
