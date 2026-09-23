import { describe, expect, it } from "vitest";
import { scoreSetup } from "./vn30";
const bars = (fall = false) => Array.from({ length: 70 }, (_, i) => {
  const close = fall ? 40 - i * 0.1 : 20 + i * 0.1;
  return { date: new Date(Date.UTC(2026, 5, i + 1)).toISOString().slice(0, 10), open: close, close, high: close + 0.2, low: close - 0.2, volume: 1e6 };
});
describe("setup là quan sát, không phải xác nhận", () => {
  it("gắn ngày nến và điều kiện cần xác nhận, không hứa giá thường chạy tiếp", () => {
    const r = scoreSetup("TEST", null, bars())!;
    expect(r.confirmed).toBe(false);
    expect(r.dataDate).toBe(bars().at(-1)!.date);
    expect(r.trigger).toContain("đóng cửa");
    expect(r.plain).not.toMatch(/thường|mua được giá tốt/);
    expect(r.facts.join(" ")).not.toContain("nhiều người mua vào");
  });
  it("RSI bằng 0 là dữ liệu hợp lệ, không phải thiếu dữ liệu", () => {
    expect(scoreSetup("TEST", null, bars(true))).not.toBeNull();
  });
});
