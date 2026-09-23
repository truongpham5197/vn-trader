import { describe, expect, it } from "vitest";
import { levelState } from "./levels";

describe("levelState", () => {
  it("giá dưới cắt lỗ → đã thủng, không phải 'sát'", () => {
    const s = levelState(85.3, 92.5, 108.5)!;
    expect(s.kind).toBe("stop-broken");
    expect(s.label).toBe("đã thủng cắt lỗ −7.8%");
    expect(s.detail).toContain("nên bán");
  });

  it("chạm đúng cắt lỗ / chốt lời", () => {
    expect(levelState(92.5, 92.5, 108.5)!.label).toBe("chạm cắt lỗ");
    expect(levelState(108.5, 92.5, 108.5)!.label).toBe("chạm chốt lời");
  });

  it("còn trên cắt lỗ ≤3% → sát, xa hơn → không báo", () => {
    expect(levelState(94, 92.5, 108.5)).toMatchObject({ kind: "near-stop", label: "sát cắt lỗ (còn 1.6%)" });
    expect(levelState(100, 92.5, 108.5)).toBeNull();
  });

  it("chốt lời: vượt / gần", () => {
    expect(levelState(110, 92.5, 108.5)!.kind).toBe("target-hit");
    expect(levelState(106, 92.5, 108.5)).toMatchObject({ kind: "near-target", label: "gần chốt lời (còn 2.3%)" });
  });

  it("thiếu giá / mốc", () => {
    expect(levelState(null, 92.5, 108.5)).toBeNull();
    expect(levelState(85, null, null)).toBeNull();
  });
});
