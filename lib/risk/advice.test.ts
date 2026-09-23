import { describe, expect, it } from "vitest";
import { positionAdvice } from "./advice";

const base = { price: 100, stop: 92, target: 110, pnlPct: 0, sessionsHeld: 3 };

describe("positionAdvice", () => {
  it("thủng cắt lỗ và đã về T+2 → bán giữ vốn", () => {
    const a = positionAdvice({ ...base, price: 85, pnlPct: -15 });
    expect(a.line).toBe("Bán để giữ vốn");
    expect(a.detail).toContain("nên bán");
    expect(a.detail).toContain("Đừng mua thêm");
  });

  it("thủng cắt lỗ nhưng chưa về T+2 → chờ cổ phiếu về", () => {
    const a = positionAdvice({ ...base, price: 85, sessionsHeld: 1 });
    expect(a.line).toBe("Bán khi cổ phiếu về");
    expect(a.detail).toContain("T+1");
  });

  it("đang lãi trong kế hoạch → giữ, có thể kéo cắt lỗ", () => {
    expect(positionAdvice({ ...base, pnlPct: 4 }).line).toBe("Giữ, có thể kéo cắt lỗ");
  });

  it("đang lỗ nhưng còn trên cắt lỗ → giữ, đừng mua thêm", () => {
    const a = positionAdvice({ ...base, price: 96, pnlPct: -4 });
    expect(a.line).toBe("Giữ theo kế hoạch");
    expect(a.detail).toContain("không mua thêm");
  });

  it("thiếu cắt lỗ → đặt trước khi giữ tiếp", () => {
    expect(positionAdvice({ ...base, stop: null }).line).toBe("Đặt cắt lỗ");
  });

  it("chưa có giá → không kết luận", () => {
    expect(positionAdvice({ ...base, price: null }).line).toBe("Chờ giá mới");
  });
});
