import { describe, expect, it } from "vitest";
import { plainBacktestVerdict } from "./plain";

describe("plainBacktestVerdict", () => {
  it("nói lỗ và từ chối tự sửa luật", () => {
    const v = plainBacktestVerdict({ totalReturnPct: -21.7, maxDrawdownPct: 28, trades: 40, benchmarkReturnPct: 5 }, "breakout-20");
    expect(v.tone).toBe("loss");
    expect(v.line).toContain("lỗ 21.7%");
    expect(v.line).toContain("Không tự sửa luật");
    expect(v.line).toContain("+5.0%");
  });

  it("run cũ không được đem ra cải thiện", () => {
    expect(plainBacktestVerdict({ totalReturnPct: 12, maxDrawdownPct: 8, trades: 3 }, "x", true).line).toContain("không đáng tin");
  });
});
