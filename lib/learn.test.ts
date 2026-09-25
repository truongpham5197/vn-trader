import { describe, expect, it } from "vitest";
import { btScore, decideMove, diffParams, neighborsOf, PARAM_LADDER, shadowScore, validCombo, type CandStats, type LearnSignal, type SymBars } from "./learn";
import { STRATEGIES } from "./strategy";
import type { StrategyDef } from "./strategy/types";
import type { Bar } from "./data/types";
import type { BtMetrics } from "./backtest/engine";

const B = (date: string, o: number, h: number, l: number, c = o): Bar => ({ date, open: o, high: h, low: l, close: c, volume: 1000 });
const stat = (over: Partial<CandStats>): CandStats => ({
  params: {},
  fired: 20,
  resolved: 20,
  missed: 0,
  wins: 10,
  losses: 10,
  timeouts: 0,
  avgPct: 0,
  avgR: 0,
  ...over,
});

describe("PARAM_LADDER", () => {
  it("mọi giá trị mặc định phải nằm trên thang của chính nó", () => {
    for (const [type, def] of Object.entries(STRATEGIES)) {
      for (const [k, steps] of Object.entries(PARAM_LADDER[type] ?? {})) {
        expect(steps, `${type}.${k}`).toContain(def.defaults[k]);
      }
    }
  });
});

describe("neighborsOf", () => {
  const cur = { donchian: 20, volMult: 1.5, atrPeriod: 14, atrStopMult: 2, rrTarget: 2 };

  it("mỗi tham số dịch ±1 bậc trên thang, giữ nguyên phần còn lại", () => {
    const ns = neighborsOf("breakout-20", cur);
    expect(ns).toHaveLength(10); // 5 tham số × 2 hướng
    expect(ns).toContainEqual({ ...cur, donchian: 15 });
    expect(ns).toContainEqual({ ...cur, donchian: 25 });
    expect(ns).toContainEqual({ ...cur, atrStopMult: 2.5 });
    expect(ns).not.toContainEqual({ ...cur, donchian: 30 }); // nhảy 2 bậc là cấm
  });

  it("ở đầu/cuối thang chỉ còn 1 hướng", () => {
    const ns = neighborsOf("breakout-20", { ...cur, donchian: 30 });
    expect(ns.filter((p) => p.donchian !== 30)).toEqual([{ ...cur, donchian: 25 }]);
  });

  it("giá trị lệch thang (owner chỉnh tay) vẫn tìm được 2 bậc gần nhất", () => {
    const ns = neighborsOf("breakout-20", { ...cur, donchian: 22 });
    const dn = ns.filter((p) => p.donchian !== 22).map((p) => p.donchian);
    expect(dn.sort()).toEqual([20, 25]);
  });

  it("chiến lược lạ → []", () => {
    expect(neighborsOf("khong-co", { x: 1 })).toEqual([]);
  });
});

describe("validCombo", () => {
  it("maFast phải nhỏ hơn maSlow, rsiBuyBelow nhỏ hơn rsiSellAbove", () => {
    expect(validCombo("pullback-ma20", { maFast: 25, maSlow: 50 })).toBe(true);
    expect(validCombo("pullback-ma20", { maFast: 50, maSlow: 50 })).toBe(false);
    expect(validCombo("rsi2-revert", { rsiBuyBelow: 10, rsiSellAbove: 70 })).toBe(true);
    expect(validCombo("rsi2-revert", { rsiBuyBelow: 70, rsiSellAbove: 60 })).toBe(false);
    expect(validCombo("breakout-20", { donchian: 99 })).toBe(true);
  });
});

describe("diffParams", () => {
  it("chỉ liệt kê key đổi", () => {
    expect(diffParams({ a: 1, b: 2 }, { a: 2, b: 2 })).toBe("a: 1 → 2");
    expect(diffParams({ a: 1 }, { a: 1 })).toBe("");
  });
});

describe("decideMove", () => {
  it("chọn lân cận tốt hơn rõ margin", () => {
    const cur = stat({ avgPct: 0.5, resolved: 30 });
    const better = stat({ avgPct: 2.0, resolved: 20, params: { x: 1 } });
    const same = stat({ avgPct: 1.0, resolved: 20, params: { x: 2 } }); // chưa đủ margin 1.0
    expect(decideMove(cur, [same, better])?.params).toEqual({ x: 1 });
  });

  it("không đủ mẫu hiện tại / candidate quá ít lệnh → giữ nguyên", () => {
    expect(decideMove(stat({ avgPct: -1, resolved: 5 }), [stat({ avgPct: 5, resolved: 30 })])).toBeNull();
    // cur 60 lệnh chốt → candidate cần ≥24; chỉ 20 → bỏ
    expect(decideMove(stat({ avgPct: 0, resolved: 60 }), [stat({ avgPct: 5, resolved: 20 })])).toBeNull();
  });

  it("không ai tốt hơn → null", () => {
    const cur = stat({ avgPct: 3 });
    expect(decideMove(cur, [stat({ avgPct: 3.4 }), stat({ avgPct: -2 })])).toBeNull();
  });
});

describe("shadowScore", () => {
  // def giả: bắn khi close > params.line; stop −1, target +2
  const fakeDef: StrategyDef = {
    defaults: { line: 20 },
    fn: ({ bars, params }) => {
      const last = bars[bars.length - 1];
      if (last.close <= params.line) return null;
      return { entry: last.close, stop: last.close - 1, target: last.close + 2, rr: 2, reason: "t" };
    },
  };
  const signal: LearnSignal = { symbolId: 1, date: "d05", outcomeDate: "d08", ticker: "X", exchange: "HOSE", bandPct: 0.07 };
  const bars: Bar[] = [
    B("d01", 22, 22.5, 21.5, 22),
    B("d02", 22, 22.5, 21.5, 22),
    B("d03", 22, 22.5, 21.5, 22),
    B("d04", 22, 22.5, 21.5, 22),
    B("d05", 25, 25.5, 24.5, 25),
    B("d06", 25, 25.4, 24.9, 25),
    B("d07", 25.2, 25.6, 24.9, 25.3),
    B("d08", 26, 27.5, 25.8, 27),
  ];
  const bySymbol = new Map<number, SymBars>([[1, { bars, at: new Map(bars.map((b, i) => [b.date, i])) }]]);

  it("chạy lại fn tại ngày tín hiệu + mô phỏng outcome trên nến sau", () => {
    const s = shadowScore("fake", fakeDef, { line: 20 }, [signal], bySymbol);
    expect(s.fired).toBe(1);
    expect(s.resolved).toBe(1);
    expect(s.wins).toBe(1);
    expect(s.avgPct).toBeGreaterThan(5); // 25 → 27 net sau phí
    expect(s.avgR).toBeCloseTo(2);
  });

  it("tham số chặt hơn không bắn → fired 0", () => {
    const s = shadowScore("fake", fakeDef, { line: 30 }, [signal], bySymbol);
    expect(s.fired).toBe(0);
    expect(s.resolved).toBe(0);
  });

  it("thiếu nến / sai ngày → bỏ qua", () => {
    const empty = new Map<number, SymBars>();
    const s = shadowScore("fake", fakeDef, { line: 20 }, [signal], empty);
    expect(s.fired).toBe(0);
    const wrongDate = shadowScore("fake", fakeDef, { line: 20 }, [{ ...signal, date: "zzz" }], bySymbol);
    expect(wrongDate.fired).toBe(0);
  });
});

describe("btScore", () => {
  const m = (over: Partial<BtMetrics>): BtMetrics => ({
    totalReturnPct: 0, cagrPct: 0, trades: 0, winRatePct: 0, avgR: 0, profitFactor: 0,
    maxDrawdownPct: 0, exposurePct: 0, skippedNoCash: 0, skippedNoFill: 0,
    closedTrades: 0, openTrades: 0, expectancyNet: 0, openMtmPnl: 0,
    benchmarkReturnPct: 0, oosReturnPct: 0, oosTrades: 0, oosExpectancyNet: 0, engineVersion: 2,
    ...over,
  });

  it("đủ lệnh OOS → dùng OOS expectancy; ít → cả kỳ; quá ít → null", () => {
    expect(btScore(m({ oosTrades: 8, oosExpectancyNet: 500, expectancyNet: 900 }))).toBe(500);
    expect(btScore(m({ oosTrades: 2, oosExpectancyNet: 500, closedTrades: 20, expectancyNet: 900 }))).toBe(900);
    expect(btScore(m({ oosTrades: 2, closedTrades: 10, expectancyNet: 900 }))).toBeNull();
  });
});
