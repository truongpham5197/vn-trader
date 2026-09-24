import { describe, expect, it } from "vitest";
import { netPnl } from "../fees";
import { bookAdvice, gainToFlatPct, positionAdvice, type BookPosition } from "./advice";

const base = { price: 100, stop: 92, target: 110, pnlPct: 0, sessionsHeld: 3 };

describe("positionAdvice", () => {
  it("thủng cắt lỗ và đã về T+2 → bán giữ vốn", () => {
    const a = positionAdvice({ ...base, price: 85, pnlPct: -15 });
    expect(a.line).toBe("Ối, thủng cắt lỗ rồi");
    expect(a.detail).toContain("không phải lệnh bán");
    expect(a.detail).toContain("Không mua thêm");
    expect(a.detail).toContain("Lời khuyên");
  });

  it("thủng cắt lỗ nhưng chưa về T+2 → chờ cổ phiếu về", () => {
    const a = positionAdvice({ ...base, price: 85, sessionsHeld: 1 });
    expect(a.line).toBe("Thủng cắt lỗ, hàng chưa về");
    expect(a.detail).toContain("T+1");
  });

  it("đang lãi trong kế hoạch → giữ, có thể kéo cắt lỗ", () => {
    expect(positionAdvice({ ...base, pnlPct: 4 }).line).toBe("Đang xanh, chill đi");
  });

  it("đang lỗ nhưng còn trên cắt lỗ → giữ, đừng mua thêm", () => {
    const a = positionAdvice({ ...base, price: 96, pnlPct: -4 });
    expect(a.line).toBe("Đỏ nhẹ, chưa tới mức");
    expect(a.detail).toContain("Không mua thêm");
  });

  it("thiếu cắt lỗ → đặt trước khi giữ tiếp", () => {
    expect(positionAdvice({ ...base, stop: null }).line).toBe("Ê, chưa có cắt lỗ");
  });

  it("chưa có giá → không kết luận", () => {
    expect(positionAdvice({ ...base, price: null }).line).toBe("Chưa có giá, bình tĩnh");
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
    expect(a.headline).toContain("GAS");
    expect(a.headline).toContain("thủng cắt lỗ");
    expect(a.headline).toContain("Lời khuyên");
    expect(a.steps[0]).toContain("cân nhắc bán");
    expect(a.steps[0]).toContain("không bán hộ");
    expect(a.protect).toContain("chờ về giá mua");
    expect(a.protect).toContain("đừng mua mã mới");
  });

  it("chưa có cắt lỗ thì việc đầu tiên là đặt mức thoát", () => {
    const a = bookAdvice([row({ ticker: "VCB", stop: null })])!;
    expect(a.headline).toContain("đặt cắt lỗ");
    expect(a.why).toContain("lỗ có trần");
  });

  it("rổ còn trong kế hoạch thì không bảo bán gấp", () => {
    const a = bookAdvice([row({ ticker: "FPT" }), row({ ticker: "VNM", qty: 100 })])!;
    expect(a.headline).toContain("Trong kế hoạch");
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

const note = (rows: BookPosition[], title: string) => bookAdvice(rows)!.notes.find((n) => n.title === title)!;

describe("gainToFlatPct", () => {
  it("lỗ f cần lãi f/(1-f) để hòa, không bịa thêm", () => {
    expect(gainToFlatPct(-20)).toBeCloseTo(25);
    expect(gainToFlatPct(-50)).toBeCloseTo(100);
    expect(gainToFlatPct(-15)).toBeCloseTo(17.647, 2);
    expect(gainToFlatPct(0)).toBeNull();
    expect(gainToFlatPct(-100)).toBeNull();
  });
});

describe("gợi ý trung bình giá, xử lý lỗ, chốt lời", () => {
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
  const buyPush = /nên trung bình|nên mua thêm|có thể mua thêm/i;

  it("thủng cắt lỗ: không trung bình, xử lý bằng bán, chưa chốt lời", () => {
    const rows = [row({ ticker: "GAS", price: 85, pnlPct: -15 })];
    const a = bookAdvice(rows)!;
    expect(a.notes.map((n) => n.title)).toEqual(["Trung bình giá", "Xử lý lỗ", "Chốt lời"]);
    expect(note(rows, "Trung bình giá").verdict).toContain("không trung bình giá GAS");
    expect(note(rows, "Xử lý lỗ").verdict).toContain("Lời khuyên");
    expect(note(rows, "Xử lý lỗ").verdict).toContain("cân nhắc bán");
    expect(note(rows, "Xử lý lỗ").verdict).toContain("không bán hộ");
    expect(note(rows, "Xử lý lỗ").why).toContain("17.6%");
    expect(note(rows, "Xử lý lỗ").why).toContain("Không kéo cắt lỗ xuống");
    expect(note(rows, "Chốt lời").verdict).toContain("Chưa có lãi");
    expect(`${a.notes.map((n) => n.verdict).join(" ")} ${a.notes.map((n) => n.why).join(" ")}`).not.toMatch(buyPush);
  });

  it("đang lỗ trên cắt lỗ: không bảo mua dù tỷ lệ lên chốt còn dương, có số lỗ thêm nếu mua 1 lô", () => {
    const rows = [row({ ticker: "HPG", price: 96, pnlPct: -4 })];
    const added = -netPnl(96, 92, 100);
    const avg = note(rows, "Trung bình giá");
    expect(avg.verdict).toContain("chưa đủ điều kiện");
    expect(avg.why).toContain("bốn điều kiện");
    expect(avg.why).toContain("không kết luận là còn chỗ để mua");
    expect(avg.why).toContain((added / 1e6).toFixed(2));
    expect(note(rows, "Xử lý lỗ").verdict).toContain("bán bớt");
    expect(note(rows, "Xử lý lỗ").verdict).toContain("Chưa nên mua thêm");
    expect(note(rows, "Chốt lời").verdict).toContain("Chưa có lãi");
    expect(avg.why).not.toMatch(buyPush);
  });

  it("thiếu cắt lỗ thì không trung bình và việc xử lý lỗ là đặt mức", () => {
    const rows = [row({ ticker: "VCB", stop: null, pnlPct: -6 })];
    expect(note(rows, "Trung bình giá").verdict).toContain("không trung bình giá VCB");
    expect(note(rows, "Xử lý lỗ").verdict).toContain("đặt cắt lỗ");
  });

  it("tới chốt lời thì chốt hoặc khóa, không nâng mức chốt", () => {
    const rows = [row({ ticker: "FPT", price: 112, pnlPct: 10 })];
    const p = note(rows, "Chốt lời");
    expect(p.verdict).toContain("Lời khuyên");
    expect(p.verdict).toContain("chốt một phần");
    expect(p.why).toContain("Không nâng mức chốt");
    expect(p.why).toContain("không đặt lệnh bán");
    expect(note(rows, "Trung bình giá").verdict).toContain("Không có mã đang lỗ");
  });

  it("đang lãi chưa tới chốt thì không bán chỉ vì đã xanh", () => {
    const rows = [row({ ticker: "VNM", pnlPct: 4 })];
    const p = note(rows, "Chốt lời");
    expect(p.verdict).toContain("Chưa bán chỉ vì đã xanh");
    expect(p.why).toContain("đã xanh");
  });

  it("gần chốt lời thì chưa bắt buộc bán hết", () => {
    const rows = [row({ ticker: "MSN", price: 107, pnlPct: 5 })];
    expect(note(rows, "Chốt lời").verdict).toContain("không bắt buộc");
    expect(note(rows, "Chốt lời").verdict).toContain("chốt bớt");
  });
});
