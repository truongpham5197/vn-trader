import { describe, expect, it } from "vitest";
import { computePortfolio, formatPortfolio } from "./portfolio";

describe("computePortfolio", () => {
  it("chưa giao dịch → NAV = vốn ban đầu", () => {
    const p = computePortfolio(100e6, [], []);
    expect(p.nav).toBe(100e6);
    expect(p.cash).toBe(100e6);
    expect(p.totalPnl).toBe(0);
    expect(p.winRate).toBeNull();
    expect(p.dayPnl).toBeNull();
  });

  it("NAV = tiền mặt + CP quy ra tiền, lãi tạm tính đã trừ phí", () => {
    // mua 1000cp @ 20 (20tr), giá lên 22
    const p = computePortfolio(100e6, [{ qty: 1000, entry: 20, price: 22, prevClose: 21 }], []);
    expect(p.cash).toBeCloseTo(100e6 - 20e6 * 1.0015);
    expect(p.marketValue).toBe(22e6);
    expect(p.nav).toBeCloseTo(p.cash + 22e6 * (1 - 0.0025));
    expect(p.unrealized).toBeCloseTo(22e6 * 0.9975 - 20e6 * 1.0015);
    expect(p.totalPnl).toBeCloseTo(p.nav - 100e6);
    expect(p.dayPnl).toBe(1e6);
  });

  it("thiếu giá → tính theo giá vốn, không NaN", () => {
    const p = computePortfolio(50e6, [{ qty: 100, entry: 30, price: null, prevClose: null }], []);
    expect(Number.isFinite(p.nav)).toBe(true);
    expect(p.dayPnl).toBeNull();
  });

  it("thống kê lệnh đã đóng", () => {
    const p = computePortfolio(
      100e6,
      [],
      [
        { ticker: "A", pnl: 2e6 },
        { ticker: "B", pnl: -1e6 },
        { ticker: "C", pnl: 4e6 },
      ],
    );
    expect(p.realized).toBe(5e6);
    expect(p.nav).toBe(105e6);
    expect(p.totalPct).toBeCloseTo(5);
    expect(p.winRate).toBeCloseTo(66.67, 1);
    expect(p.avgWin).toBe(3e6);
    expect(p.avgLoss).toBe(-1e6);
    expect(p.best?.ticker).toBe("C");
    expect(p.worst?.ticker).toBe("B");
    expect(formatPortfolio(p)).toContain("thắng 2/3");
  });
});
