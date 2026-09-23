import { describe, expect, it } from "vitest";
import { bookAdvice, positionAdvice, type BookPosition } from "./advice";

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

describe("bookAdvice", () => {
  const row = (over: Partial<BookPosition> & { ticker: string }): BookPosition => ({
    price: 100,
    stop: 92,
    target: 110,
    pnlPct: 0,
    sessionsHeld: 3,
    qty: 100,
    entry: 100,
    ...over,
  });

  it("mã thủng cắt lỗ được ưu tiên bán để giữ vốn", () => {
    const a = bookAdvice([
      row({ ticker: "GAS", price: 85, pnlPct: -15 }),
      row({ ticker: "FPT", pnlPct: 1 }),
    ])!;
    expect(a.headline).toContain("bán GAS");
    expect(a.why).toContain("ngoài kế hoạch");
    expect(a.steps[0]).toContain("Bán GAS");
    expect(a.protect).toContain("đừng chờ về giá mua");
    expect(a.protect).toContain("đừng mua mã mới");
  });

  it("chưa có cắt lỗ thì việc đầu tiên là đặt mức thoát", () => {
    const a = bookAdvice([row({ ticker: "VCB", stop: null })])!;
    expect(a.headline).toContain("đặt cắt lỗ");
    expect(a.why).toContain("lỗ có trần");
  });

  it("rổ còn trong kế hoạch thì không bảo bán gấp", () => {
    const a = bookAdvice([row({ ticker: "FPT" }), row({ ticker: "VNM", qty: 100 })])!;
    expect(a.headline).toContain("Giữ theo kế hoạch");
    expect(a.steps.join(" ")).not.toContain("Bán ngay");
    expect(a.protect).toContain("Không mua thêm mã đang lỗ");
  });

  it("một mã chiếm phần lớn thì nhắc đừng mua thêm mã đó", () => {
    const a = bookAdvice([
      row({ ticker: "HPG", qty: 1000 }),
      row({ ticker: "FPT", qty: 100 }),
      row({ ticker: "VNM", qty: 100 }),
    ])!;
    expect(a.why).toContain("HPG");
    expect(a.protect).toContain("Đừng mua thêm HPG");
  });

  it("không có vị thế thì không gợi ý", () => {
    expect(bookAdvice([])).toBeNull();
  });
});
