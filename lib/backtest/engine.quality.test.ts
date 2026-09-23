import { describe, expect, it } from "vitest";
import { runBacktest, DEFAULT_BT_CONFIG, type BacktestConfig } from "./engine";
import type { Bar } from "../data/types";
import type { SignalCandidate, StrategyDef } from "../strategy/types";

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

function bar(date: string, o: number, h: number, l: number, c: number, v = 1_000_000): Bar {
  return { date, open: o, high: h, low: l, close: c, volume: v };
}

function flat(price = 50): Map<string, Bar[]> {
  return new Map([["TST", DATES.map((d) => bar(d, price, price, price, price))]]);
}

function scripted(opts: {
  signalDate: string;
  entry: number;
  stop: number;
  target: number;
  buyZone?: [number, number];
  exitOnClose?: string;
}): StrategyDef {
  return {
    defaults: {},
    fn: ({ bars }): SignalCandidate | null => {
      const last = bars[bars.length - 1];
      if (last.date !== opts.signalDate) return null;
      return {
        entry: opts.entry,
        stop: opts.stop,
        target: opts.target,
        rr: (opts.target - opts.entry) / (opts.entry - opts.stop),
        reason: "test",
        buyZone: opts.buyZone,
      };
    },
    shouldExit: opts.exitOnClose
      ? ({ bars }) => (bars[bars.length - 1].date === opts.exitOnClose ? "rule-exit" : null)
      : undefined,
  };
}

function run(
  bars: Map<string, Bar[]>,
  strategy: StrategyDef,
  extra: Partial<BacktestConfig> = {},
  band = 0.07,
) {
  return runBacktest(bars, new Map([["TST", band]]), strategy, { ...CFG, ...extra });
}

describe("equity gồm khoản phải thu T+2", () => {
  it("sau bán, equity không mất phần proceeds chưa settle", () => {
    const dates = DATES;
    const bars = new Map([
      [
        "TST",
        dates.map((d, i) => {
          if (i === 3) return bar(d, 50, 50, 44, 45); // eligible stop
          return bar(d, 50, 50, 50, 50);
        }),
      ],
    ]);
    const result = run(
      bars,
      scripted({ signalDate: dates[0], entry: 50, stop: 45, target: 80 }),
    );
    const closed = result.trades.filter((t) => t.exitDate);
    expect(closed).toHaveLength(1);
    expect(closed[0].exitDate).toBe(dates[3]);

    const sellEq = result.equity.find((e) => e.date === dates[3])!.equity;
    const lastEq = result.equity[result.equity.length - 1].equity;
    // Không được “rơi” gần hết giá trị vị thế rồi mới hồi khi tiền về.
    expect(sellEq).toBeCloseTo(lastEq, -2);
    expect(result.metrics.maxDrawdownPct).toBeLessThan(8);
  });

  it("hết kỳ: không ép bán vị thế chưa đủ T+2 — để mở, equity = MTM", () => {
    const dates = DATES.slice(0, 3); // signal d0, fill d1, last d2 — chưa đủ T+2
    const bars = new Map([["TST", dates.map((d) => bar(d, 50, 50, 50, 52))]]);
    const result = run(
      bars,
      scripted({ signalDate: dates[0], entry: 50, stop: 45, target: 80 }),
    );
    const open = result.trades.filter((t) => !t.exitDate);
    expect(open).toHaveLength(1);
    expect(open[0].exitReason ?? "open").toMatch(/open/i);
    expect(result.metrics.openTrades).toBe(1);
    expect(result.metrics.closedTrades).toBe(0);

    const last = result.equity[result.equity.length - 1];
    expect(last.equity).toBeGreaterThan(CFG.navVnd); // MTM close 52 > entry 50
    const closedPnl = result.trades.reduce((s, t) => s + (t.pnl ?? 0), 0);
    // Chưa đóng thì pnl thực hiện không được bịa để khớp equity.
    expect(closedPnl).toBe(0);
  });

  it("vị thế đủ T+2 lúc hết kỳ: thanh lý theo close, equity khớp pnl", () => {
    const dates = DATES; // fill d1, eligible d3, còn nhiều phiên
    const bars = new Map([["TST", dates.map((d) => bar(d, 50, 50, 50, 50))]]);
    const result = run(
      bars,
      scripted({ signalDate: dates[0], entry: 50, stop: 45, target: 80 }),
    );
    const closed = result.trades.filter((t) => t.exitDate);
    expect(closed.length).toBe(1);
    expect(closed[0].exitReason).toBe("end-of-test");
    const last = result.equity[result.equity.length - 1].equity;
    const first = result.equity[0].equity;
    const pnl = closed[0].pnl!;
    expect(last - first).toBeCloseTo(pnl, -1);
  });
});

describe("shouldExit trên nến đóng → khớp phiên sau", () => {
  it("không bán cùng close tín hiệu shouldExit", () => {
    const dates = DATES;
    const bars = new Map([["TST", dates.map((d) => bar(d, 50, 50, 50, 50))]]);
    const result = run(
      bars,
      scripted({
        signalDate: dates[0],
        entry: 50,
        stop: 40,
        target: 80,
        exitOnClose: dates[4], // eligible (fill d1, T+2 = d3)
      }),
    );
    const t = result.trades.find((x) => x.exitDate);
    expect(t).toBeDefined();
    expect(t!.exitReason).toBe("rule-exit");
    expect(t!.exitDate).toBe(dates[5]); // phiên kế, không phải dates[4]
  });

  it("không latch target từ phiên chưa được bán T+2", () => {
    const dates = DATES;
    const bars = new Map([
      [
        "TST",
        dates.map((d, i) => {
          if (i === 2) return bar(d, 50, 90, 50, 80); // target 70 chạm nhưng chưa T+2
          return bar(d, 50, 50, 50, 50); // T+2 không còn chạm target
        }),
      ],
    ]);
    const result = run(
      bars,
      scripted({ signalDate: dates[0], entry: 50, stop: 40, target: 70 }),
    );
    const t = result.trades.find((x) => x.exitReason === "target");
    expect(t).toBeUndefined();
  });
});

describe("khớp lệnh mua LO / band", () => {
  it("không fill trên giá limit kể cả khi cộng slippage", () => {
    const dates = DATES;
    const bars = new Map([
      [
        "TST",
        dates.map((d, i) => {
          if (i === 1) return bar(d, 50.5, 51, 49.5, 50.5); // low chạm 50, open > limit
          return bar(d, 50, 50, 50, 50);
        }),
      ],
    ]);
    const result = run(
      bars,
      scripted({ signalDate: dates[0], entry: 50, stop: 45, target: 80 }),
    );
    const t = result.trades[0];
    expect(t).toBeDefined();
    expect(t.entry).toBeLessThanOrEqual(50);
    expect(t.entryDate).toBe(dates[1]);
  });

  it("từ chối gap dưới stop", () => {
    const dates = DATES;
    const bars = new Map([
      [
        "TST",
        dates.map((d, i) => {
          if (i === 1) return bar(d, 40, 41, 39, 40); // mở cửa dưới stop 45
          return bar(d, 50, 50, 50, 50);
        }),
      ],
    ]);
    const result = run(
      bars,
      scripted({ signalDate: dates[0], entry: 50, stop: 45, target: 80 }),
    );
    expect(result.trades).toHaveLength(0);
    expect(result.metrics.skippedNoFill).toBeGreaterThan(0);
  });

  it("từ chối gap dưới buyZone", () => {
    const dates = DATES;
    const bars = new Map([
      [
        "TST",
        dates.map((d, i) => {
          if (i === 1) return bar(d, 46, 47, 45.5, 46); // dưới zone [48,50], trên stop 40
          return bar(d, 50, 50, 50, 50);
        }),
      ],
    ]);
    const result = run(
      bars,
      scripted({
        signalDate: dates[0],
        entry: 50,
        stop: 40,
        target: 80,
        buyZone: [48, 50],
      }),
    );
    expect(result.trades).toHaveLength(0);
    expect(result.metrics.skippedNoFill).toBeGreaterThan(0);
  });

  it("không fill mua khi nến nằm trần", () => {
    const dates = DATES;
    const prev = 50;
    const ceiling = prev * 1.07;
    const bars = new Map([
      [
        "TST",
        dates.map((d, i) => {
          if (i === 1) return bar(d, ceiling, ceiling, ceiling, ceiling);
          return bar(d, prev, prev, prev, prev);
        }),
      ],
    ]);
    const result = run(
      bars,
      scripted({ signalDate: dates[0], entry: ceiling, stop: 45, target: 80 }),
      {},
      0.07,
    );
    expect(result.trades).toHaveLength(0);
    expect(result.metrics.skippedNoFill).toBeGreaterThan(0);
  });

  it("không mua trên trần band", () => {
    const dates = DATES;
    const bars = new Map([
      [
        "TST",
        dates.map((d, i) => {
          // d0 close 50 → trần 53.5; d1 open 54 (vượt trần — không hợp lệ)
          if (i === 1) return bar(d, 54, 54, 49, 52);
          return bar(d, 50, 50, 50, 50);
        }),
      ],
    ]);
    const result = run(
      bars,
      scripted({ signalDate: dates[0], entry: 54, stop: 45, target: 80 }),
      {},
      0.07,
    );
    const t = result.trades[0];
    if (t) expect(t.entry).toBeLessThanOrEqual(50 * 1.07);
    else expect(result.metrics.skippedNoFill).toBeGreaterThan(0);
  });
});
