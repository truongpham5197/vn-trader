import { describe, expect, it } from "vitest";
import { runBacktest, DEFAULT_BT_CONFIG } from "./engine";
import type { Bar } from "../data/types";
import { STRATEGIES } from "../strategy";

function bar(date: string, o: number, h: number, l: number, c: number, v = 1_000_000): Bar {
  return { date, open: o, high: h, low: l, close: c, volume: v };
}

/** Sinh n phiên phẳng bắt đầu từ startDate, bỏ qua T7/CN. */
function flatBars(startDate: string, n: number, price = 50, v = 1_000_000): Bar[] {
  const out: Bar[] = [];
  const d = new Date(startDate);
  while (out.length < n) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      out.push(bar(d.toISOString().slice(0, 10), price, price, price, price, v));
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const CFG = { ...DEFAULT_BT_CONFIG, params: {}, navVnd: 500_000_000, riskPct: 0.01 };

/**
 * 40 phiên phẳng @50 → breakout 51 (vol 2x) → fill phiên sau
 * → thủng stop nhưng chưa đủ T+2 → exit phiên eligible.
 */
function scenario(): Map<string, Bar[]> {
  return new Map([
    [
      "TST",
      [
        ...flatBars("2026-07-06", 39), // kết thúc 2026-08-27
        bar("2026-08-28", 50, 51.2, 50, 51, 2_000_000), // breakout day (Fri)
        bar("2026-08-31", 51, 51.5, 50.5, 51), // fill day (Mon)
        bar("2026-09-01", 50.8, 51, 50.2, 50.6), // thủng stop nhưng chưa đủ T+2
        bar("2026-09-02", 50.6, 50.8, 50.4, 50.5), // đủ T+2 → exit nếu low <= stop
        bar("2026-09-03", 50.5, 50.6, 50.3, 50.4),
      ],
    ],
  ]);
}

describe("runBacktest — luật VN", () => {
  const bandPct = new Map([["TST", 0.07]]);
  const result = runBacktest(scenario(), bandPct, STRATEGIES["breakout-20"], {
    ...CFG,
    fromDate: "2026-08-01",
  });

  it("phát sinh đúng 1 trade", () => {
    expect(result.trades.length).toBe(1);
  });

  it("fill ở phiên sau tín hiệu, không vượt giá limit", () => {
    const t = result.trades[0];
    expect(t.entryDate).toBe("2026-08-31");
    expect(t.entry).toBeLessThanOrEqual(51);
    expect(t.entry).toBeGreaterThan(50);
  });

  it("không bán trước T+2 — exit đúng phiên eligible", () => {
    const t = result.trades[0];
    // stop = floor(51 - 2×ATR≈0.086→50.83) = 50.5
    // 09-01 low 50.2 thủng nhưng chưa settle → giữ; 09-02 low 50.4 <= stop → exit
    expect(t.exitDate).toBe("2026-09-02");
    expect(t.exitReason).toBe("stop");
  });

  it("pnl âm và trừ phí+thuế+slippage", () => {
    const t = result.trades[0];
    expect(t.pnl).toBeLessThan(0);
    expect(result.metrics.trades).toBe(1);
    expect(result.metrics.winRatePct).toBe(0);
  });

  it("equity curve bắt đầu từ fromDate, không gồm warmup", () => {
    expect(result.equity[0].date >= "2026-08-01").toBe(true);
  });
});
