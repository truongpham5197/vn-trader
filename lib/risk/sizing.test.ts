import { describe, expect, it } from "vitest";
import { positionSize } from "./sizing";

describe("positionSize", () => {
  it("tính qty theo risk budget, làm tròn lot 100", () => {
    // NAV 500tr, risk 1% = 5tr. entry 100k, stop 95k → rủi ro 5k/cp → 1000cp
    const r = positionSize({ navVnd: 500e6, riskPct: 0.01, entry: 100, stop: 95 });
    expect(r.qty).toBe(1000);
    expect(r.riskVnd).toBe(5e6);
    expect(r.valueVnd).toBe(100e6);
  });

  it("floor xuống lot 100", () => {
    // rủi ro 1.2k/cp → rawQty 4166 → 4100
    const r = positionSize({ navVnd: 500e6, riskPct: 0.01, entry: 50, stop: 48.8 });
    expect(r.qty).toBe(4100);
  });

  it("qty=0 khi stop >= entry", () => {
    expect(positionSize({ navVnd: 500e6, riskPct: 0.01, entry: 50, stop: 50 }).qty).toBe(0);
    expect(positionSize({ navVnd: 500e6, riskPct: 0.01, entry: 50, stop: 55 }).qty).toBe(0);
  });

  it("qty=0 khi risk budget quá nhỏ cho 1 lot", () => {
    const r = positionSize({ navVnd: 10e6, riskPct: 0.01, entry: 100, stop: 95 });
    expect(r.qty).toBe(0);
  });
});
