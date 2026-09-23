import { describe, expect, it, vi } from "vitest";
vi.mock("./prisma", () => ({ prisma: {} }));
import { netPnl } from "./trades";

describe("netPnl", () => {
  it("trừ phí mua 0.15% + phí bán 0.15% + thuế 0.1%", () => {
    // 100cp mua 20 bán 22: 2,200,000×0.9975 − 2,000,000×1.0015
    expect(netPnl(20, 22, 100)).toBeCloseTo(2_194_500 - 2_003_000);
  });
  it("hòa giá vẫn lỗ phí", () => {
    expect(netPnl(50, 50, 100)).toBeCloseTo(-5_000_000 * 0.004);
  });
});
