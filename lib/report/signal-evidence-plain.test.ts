import { describe, expect, it } from "vitest";
import { plainEvidenceVerdict, type HorizonStats } from "./signal-evidence";

const h = (over: Partial<HorizonStats>): HorizonStats => ({
  sessions: 5,
  mature: 0,
  pending: 0,
  missingData: 0,
  backfilled: 0,
  mean: null,
  median: null,
  positiveCount: 0,
  positiveDenom: 0,
  positiveFraction: null,
  sampleWarning: null,
  ...over,
});

describe("plainEvidenceVerdict", () => {
  it("chưa có tín hiệu thì nói thẳng", () => {
    expect(plainEvidenceVerdict({ analyzed: 0, horizons: [], periodStart: "2026-06-01", periodEnd: "2026-09-01" }).title).toBe(
      "Chưa có gì để kiểm tra",
    );
  });

  it("nói giá đi đâu, không gọi là lãi khớp lệnh", () => {
    const v = plainEvidenceVerdict({
      analyzed: 8,
      periodStart: "2026-06-01",
      periodEnd: "2026-09-01",
      horizons: [h({ mature: 8, mean: 0.021, positiveCount: 5, positiveDenom: 8, positiveFraction: 0.625 })],
    });
    expect(v.line).toContain("+2.1%");
    expect(v.line).toContain("5/8 mã giá cao hơn");
    expect(v.line).toContain("Mẫu còn ít");
    expect(v.line).not.toContain("lãi/lỗ khớp");
  });
});
