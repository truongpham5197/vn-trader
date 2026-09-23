import { describe, expect, it } from "vitest";
import { chartIndex } from "../app/components/PriceChart";

describe("chartIndex", () => {
  it("mép trái là phiên đầu, mép phải là phiên cuối", () => {
    expect(chartIndex(0, 11)).toBe(0);
    expect(chartIndex(1, 11)).toBe(10);
    expect(chartIndex(0.5, 11)).toBe(5);
  });

  it("ngón tay ra ngoài biểu đồ vẫn kẹp về phiên gần nhất", () => {
    expect(chartIndex(-0.2, 5)).toBe(0);
    expect(chartIndex(1.4, 5)).toBe(4);
  });
});
