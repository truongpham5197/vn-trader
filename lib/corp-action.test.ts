import { describe, expect, it } from "vitest";
import { detectAdjustment } from "./corp-action";

const bar = (date: string, close: number) => ({ date, close });

// GAS thực tế: raw 88 → adjusted 85.52 (factor ≈ 0.9718, cổ tức tiền ~2.5k)
const storedGas = [
  bar("2026-09-14", 85.7),
  bar("2026-09-15", 91.4),
  bar("2026-09-16", 89.4),
  bar("2026-09-17", 88.6),
  bar("2026-09-18", 88),
];
const freshGas = [
  bar("2026-09-14", 83.28),
  bar("2026-09-15", 88.82),
  bar("2026-09-16", 86.88),
  bar("2026-09-17", 86.1),
  bar("2026-09-18", 85.52),
  bar("2026-09-21", 86.1), // phiên GDKHQ — scale mới, chưa có trong stored
];

describe("detectAdjustment", () => {
  it("nhận diện cổ tức tiền (factor ~0.97, exDate = phiên mới)", () => {
    const r = detectAdjustment(storedGas, freshGas);
    expect(r).not.toBeNull();
    expect(r!.factor).toBeCloseTo(0.9718, 3);
    expect(r!.exDate).toBe("2026-09-21");
    expect(r!.kind).toBe("cash");
  });

  it("không đổi → null", () => {
    expect(detectAdjustment(storedGas, storedGas.concat(bar("2026-09-21", 88)))).toBeNull();
  });

  it("stored đã có bar post-ex (ratio≈1) vẫn detect được", () => {
    const stored2 = [...storedGas, bar("2026-09-21", 86.1)];
    const r = detectAdjustment(stored2, freshGas);
    expect(r!.exDate).toBe("2026-09-21");
    expect(r!.factor).toBeCloseTo(0.9718, 3);
  });

  it("dưới MIN_OVERLAP ngày chung → null", () => {
    expect(detectAdjustment(storedGas.slice(0, 2), freshGas)).toBeNull();
  });

  it("tỷ lệ không đồng nhất → null (không phải GDKHQ)", () => {
    const noisy = storedGas.map((b, i) => bar(b.date, b.close * (1 - 0.02 * (i + 1))));
    expect(detectAdjustment(storedGas, noisy)).toBeNull();
  });

  it("factor < 0.9 → kind split (chia tách/thưởng CP)", () => {
    const stored = [bar("d1", 100), bar("d2", 100), bar("d3", 100), bar("d4", 100)];
    const fresh = [bar("d1", 50), bar("d2", 50), bar("d3", 50), bar("d4", 50), bar("d5", 51)];
    const r = detectAdjustment(stored, fresh);
    expect(r!.kind).toBe("split");
    expect(r!.factor).toBeCloseTo(0.5, 3);
  });

  it("không có ngày mới sau pre-ex → null", () => {
    // toàn bộ fresh đều nằm trong stored và đều bị adjust → không xác định exDate
    const r = detectAdjustment(storedGas, freshGas.slice(0, 5));
    expect(r).toBeNull();
  });
});
