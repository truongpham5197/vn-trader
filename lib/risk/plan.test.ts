import { describe, expect, it } from "vitest";
import { estimatePlan, PLAN_LIMITS } from "./plan";
import { BUY_FEE, netPnl } from "../fees";

const base = {
  ticker: "FPT",
  sector: "Công nghệ",
  entry: 100,
  stop: 95,
  target: 110,
  nav: 500e6,
  cash: 500e6,
  riskPct: 0.01,
  avg20ValueVnd: 50e9,
  holdings: [] as {
    ticker: string;
    sector: string | null;
    qty: number;
    entry: number;
    price: number | null;
    stop: number | null;
  }[],
};

describe("estimatePlan", () => {
  it("qty theo risk 1% NAV, lot 100, không lấy qty chủ app", () => {
    const r = estimatePlan(base);
    expect(r.qty).toBe(1000);
    expect(r.riskVnd).toBe(5e6);
    expect(r.valueVnd).toBe(100e6);
  });

  it("làm tròn xuống lot 100", () => {
    // risk 5tr / 5.7k = 877 → 800; trần vị thế 20% = 1000 nên risk thắng
    const r = estimatePlan({ ...base, stop: 94.3 });
    expect(r.qty).toBe(800);
    expect(r.qty % 100).toBe(0);
    expect(r.caps.risk).toBe(800);
  });

  it("trần tiền mặt đã gồm phí mua", () => {
    const cash = 50e6;
    const r = estimatePlan({ ...base, cash });
    const max = Math.floor(cash / (100 * 1000 * (1 + BUY_FEE)) / 100) * 100;
    expect(r.qty).toBe(max);
    expect(r.caps.cash).toBe(max);
    expect(r.costVnd).toBeLessThanOrEqual(cash);
    expect(r.binding).toContain("cash");
  });

  it("qty=0 khi không đủ tiền 1 lot sau phí", () => {
    const r = estimatePlan({ ...base, cash: 5e6 });
    expect(r.qty).toBe(0);
    expect(r.reasons.some((x) => /tiền mặt/i.test(x))).toBe(true);
  });

  it("trần 20% NAV/mã, tính vị thế sẵn có theo giá live", () => {
    const r = estimatePlan({
      ...base,
      holdings: [{ ticker: "FPT", sector: "Công nghệ", qty: 500, entry: 80, price: 100, stop: 70 }],
    });
    // 20% of 500tr = 100tr; existing 500*100*1000=50tr; room 50tr → 500cp; risk wants 1000
    expect(r.qty).toBe(500);
    expect(r.caps.position).toBe(500);
  });

  it("thiếu giá live → dùng giá vốn (conservative) cho trần vị thế", () => {
    const r = estimatePlan({
      ...base,
      holdings: [{ ticker: "FPT", sector: "Công nghệ", qty: 800, entry: 100, price: null, stop: 90 }],
    });
    // existing 80tr, room 20tr → 200cp
    expect(r.qty).toBe(200);
  });

  it("trần 35% ngành theo giá live", () => {
    const r = estimatePlan({
      ...base,
      holdings: [{ ticker: "CMG", sector: "Công nghệ", qty: 1450, entry: 90, price: 100, stop: 99.5 }],
    });
    // 35% of 500tr = 175tr; existing 145tr; room 30tr → 300cp
    expect(r.qty).toBe(300);
    expect(r.caps.sector).toBe(300);
  });

  it("ngành null không gộp với mã khác thiếu ngành", () => {
    const r = estimatePlan({
      ...base,
      sector: null,
      holdings: [{ ticker: "VNM", sector: null, qty: 2000, entry: 100, price: 100, stop: 90 }],
    });
    expect(r.qty).toBe(1000);
  });

  it("trần 5% rủi ro danh mục; vị thế sẵn có tính theo giá live", () => {
    const r = estimatePlan({
      ...base,
      holdings: [{ ticker: "VNM", sector: "Hàng tiêu dùng", qty: 2000, entry: 50, price: 60, stop: 50 }],
    });
    // existing risk 2000*(60-50)*1000=20tr; max 25tr; còn 5tr → 1000cp — trùng risk/lệnh
    expect(r.caps.portfolioRisk).toBe(1000);
    expect(r.qty).toBe(1000);
  });

  it("rủi ro danh mục còn ít → qty nhỏ hơn risk/lệnh", () => {
    const r = estimatePlan({
      ...base,
      holdings: [{ ticker: "VNM", sector: "Hàng tiêu dùng", qty: 4400, entry: 50, price: 55, stop: 50 }],
    });
    // existing 4400*(55-50)*1000=22tr; max 25tr; còn 3tr → 600cp
    expect(r.qty).toBe(600);
    expect(r.caps.portfolioRisk).toBe(600);
    expect(r.caps.risk).toBe(1000);
  });

  it("thiếu cắt lỗ vị thế đang giữ → chặn gợi ý, không coi rủi ro = 0", () => {
    const r = estimatePlan({
      ...base,
      holdings: [{ ticker: "VNM", sector: "Hàng tiêu dùng", qty: 1000, entry: 50, price: 60, stop: null }],
    });
    expect(r.qty).toBe(0);
    expect(r.caps.portfolioRisk).toBeNull();
    expect(r.reasons.some((x) => /thiếu cắt lỗ/i.test(x))).toBe(true);
  });

  it("trần 1% GTGD TB20", () => {
    const r = estimatePlan({ ...base, avg20ValueVnd: 40e6 });
    // 1% of 40tr = 0.4tr → 4cp → 0 lot
    expect(r.qty).toBe(0);
    expect(r.caps.liquidity).toBe(0);
  });

  it("lãi/lỗ net sau phí tại giá mua đã nhập", () => {
    const r = estimatePlan(base);
    expect(r.lossAtStop).toBeCloseTo(netPnl(100, 95, 1000));
    expect(r.gainAtTarget).toBeCloseTo(netPnl(100, 110, 1000));
    expect(r.lossAtStop).toBeLessThan(0);
    expect(r.gainAtTarget).toBeGreaterThan(0);
  });

  it("qty=0 khi stop >= entry hoặc entry >= target", () => {
    expect(estimatePlan({ ...base, stop: 100 }).qty).toBe(0);
    expect(estimatePlan({ ...base, stop: 105 }).qty).toBe(0);
    expect(estimatePlan({ ...base, target: 100 }).qty).toBe(0);
    expect(estimatePlan({ ...base, target: 90 }).qty).toBe(0);
    expect(estimatePlan({ ...base, stop: 100 }).reasons.some((x) => /cắt lỗ/i.test(x))).toBe(true);
  });

  it("qty=0 khi thiếu stop/target", () => {
    expect(estimatePlan({ ...base, stop: null }).qty).toBe(0);
    expect(estimatePlan({ ...base, target: null }).qty).toBe(0);
  });

  it("từ chối input không hữu hạn / không dương", () => {
    expect(estimatePlan({ ...base, entry: NaN }).qty).toBe(0);
    expect(estimatePlan({ ...base, entry: Infinity }).qty).toBe(0);
    expect(estimatePlan({ ...base, entry: -10 }).qty).toBe(0);
    expect(estimatePlan({ ...base, entry: 0 }).qty).toBe(0);
    expect(estimatePlan({ ...base, nav: NaN }).qty).toBe(0);
    expect(estimatePlan({ ...base, cash: NaN }).qty).toBe(0);
  });

  it("ghi rõ giả định, không phải chiến lược tối ưu", () => {
    const r = estimatePlan(base);
    expect(r.assumptions.join(" ")).toMatch(/không đảm bảo/i);
    expect(r.assumptions.join(" ")).toMatch(/không tối ưu/i);
    expect(PLAN_LIMITS.maxPositionPct).toBe(0.2);
    expect(PLAN_LIMITS.maxSectorPct).toBe(0.35);
    expect(PLAN_LIMITS.maxPortfolioRiskPct).toBe(0.05);
    expect(PLAN_LIMITS.maxLiquidityPct).toBe(0.01);
  });
});
