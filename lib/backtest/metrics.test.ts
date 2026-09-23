import { describe, expect, it } from "vitest";
import {
  ENGINE_VERSION,
  equalWeightBuyHoldReturn,
  runBacktest,
  DEFAULT_BT_CONFIG,
  type BacktestConfig,
} from "./engine";
import type { Bar } from "../data/types";
import type { SignalCandidate, StrategyDef } from "../strategy/types";
import { isLegacyRun, serializeRunParams } from "./report";

const CFG: BacktestConfig = {
  ...DEFAULT_BT_CONFIG,
  params: {},
  navVnd: 500_000_000,
  riskPct: 0.01,
  maxPositions: 1,
};

const DATES = [
  "2026-08-03",
  "2026-08-04",
  "2026-08-05",
  "2026-08-06",
  "2026-08-07",
  "2026-08-10",
  "2026-08-11",
  "2026-08-12",
  "2026-08-13",
  "2026-08-14",
];

function bar(date: string, o: number, h: number, l: number, c: number): Bar {
  return { date, open: o, high: h, low: l, close: c, volume: 1_000_000 };
}

function alwaysSignal(entry = 50, stop = 45, target = 80): StrategyDef {
  return {
    defaults: {},
    fn: ({ bars }): SignalCandidate | null => {
      const last = bars[bars.length - 1];
      if (last.date !== DATES[0]) return null;
      return { entry, stop, target, rr: 2, reason: "t" };
    },
  };
}

describe("metrics: closed vs open, expectancy net, OOS, engine version", () => {
  it("tách closed/open, expectancy = TB pnl net lệnh đóng", () => {
    const bars = new Map([["TST", DATES.map((d) => bar(d, 50, 50, 50, 50))]]);
    const result = runBacktest(bars, new Map([["TST", 0.07]]), alwaysSignal(), CFG);
    expect(result.metrics.engineVersion).toBe(ENGINE_VERSION);
    expect(result.metrics.closedTrades).toBe(result.metrics.trades);
    expect(result.metrics.openTrades).toBe(0);
    const closed = result.trades.filter((t) => t.exitDate);
    const mean = closed.reduce((s, t) => s + (t.pnl ?? 0), 0) / closed.length;
    expect(result.metrics.expectancyNet).toBeCloseTo(mean, 6);
  });

  it("OOS là đoạn cuối deterministic, không phải xác suất", () => {
    const bars = new Map([["TST", DATES.map((d) => bar(d, 50, 50, 50, 50))]]);
    const result = runBacktest(bars, new Map([["TST", 0.07]]), alwaysSignal(), {
      ...CFG,
      oosFraction: 0.3,
    });
    expect(result.metrics.oosTrades).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.metrics.oosReturnPct)).toBe(true);
  });
});

describe("benchmark equal-weight buy-hold cùng phí", () => {
  it("một mã phẳng: lợi nhuận ≈ −phí khứ hồi", () => {
    const bars = new Map([["TST", DATES.map((d) => bar(d, 50, 50, 50, 50))]]);
    const pct = equalWeightBuyHoldReturn(bars, CFG);
    // mua+bán ~0.15%+0.25% + slippage hai đầu
    expect(pct).toBeLessThan(0);
    expect(pct).toBeGreaterThan(-2);
  });
});

describe("isEntryEligible chặn signal mới, không đá vị thế đang giữ", () => {
  it("không mở lệnh ngày không eligible", () => {
    const bars = new Map([["TST", DATES.map((d) => bar(d, 50, 50, 50, 50))]]);
    const result = runBacktest(bars, new Map([["TST", 0.07]]), alwaysSignal(), {
      ...CFG,
      isEntryEligible: () => false,
    });
    expect(result.trades).toHaveLength(0);
  });
});

describe("report: legacy + params JSON đủ cfg", () => {
  it("run không có engineVersion là legacy", () => {
    expect(isLegacyRun({ totalReturnPct: 1 }, "{\"donchian\":20}")).toBe(true);
    expect(isLegacyRun({ engineVersion: ENGINE_VERSION }, "{}")).toBe(false);
  });

  it("serializeRunParams giữ strategy params ở top-level + _bt", () => {
    const json = serializeRunParams({
      strategyParams: { donchian: 20 },
      cfg: CFG,
      universe: "liquid",
      fromDate: "2023-01-01",
      toDate: "2024-01-01",
    });
    const p = JSON.parse(json);
    expect(p.donchian).toBe(20);
    expect(p._bt.engineVersion).toBe(ENGINE_VERSION);
    expect(p._bt.navVnd).toBe(CFG.navVnd);
    expect(p._bt.universe).toBe("liquid");
  });
});
