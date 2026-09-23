import { describe, expect, it } from "vitest";
import { assessOpportunity, type OpportunityInput } from "./opportunity";

const input: OpportunityInput = { confirmed: true, price: 20, stop: 19, target: 23, buyZone: [19.8, 20.2], fresh: true };

describe("assessOpportunity", () => {
  it("giá trong vùng không biến setup chưa xác nhận thành tín hiệu mua", () => {
    const result = assessOpportunity({ confirmed: false, price: 20, stop: 19, target: 23, buyZone: [19.8, 20.2], fresh: true });
    expect(result.state).toBe("watch");
    expect(result.actionable).toBe(false);
    expect(result.label).toContain("Chờ xác nhận");
  });

  it.each([
    [{ price: 19 }, "invalid"],
    [{ price: 23 }, "invalid"],
    [{ price: 20.3 }, "extended"],
    [{ price: 19.5 }, "waiting"],
    [{ fresh: false }, "stale"],
    [{ price: null }, "stale"],
    [{ expired: true }, "expired"],
    [{ marketWeak: true }, "blocked"],
    [{ liquid: false }, "blocked"],
    [{ target: 20.1 }, "blocked"],
    [{ stop: Number.NaN }, "invalid"],
    [{ buyZone: [21, 19] }, "invalid"],
  ] as [Partial<OpportunityInput>, string][])("chặn khi %j", (over, state) => {
    const r = assessOpportunity({ ...input, ...over });
    expect(r.state).toBe(state);
    expect(r.actionable).toBe(false);
  });

  it("tính R:R ròng tại giá đang xét và chỉ cho cân nhắc khi đủ điều kiện", () => {
    const r = assessOpportunity(input);
    expect(r.state).toBe("actionable");
    expect(r.actionable).toBe(true);
    expect(r.netRR).toBeLessThan(3);
    expect(r.netRR).toBeGreaterThan(2);
  });
});
