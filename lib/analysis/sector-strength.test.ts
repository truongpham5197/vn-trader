import { describe, expect, it } from "vitest";
import { computeSectorStrength, formatSectorStrength, type StockInput } from "./sector-strength";

/** Chuỗi giá tuyến tính từ `from` → `to` trong n phiên, GTGD tăng dần theo `flowTail` ở 5 phiên cuối. */
function stock(ticker: string, sector: string, from: number, to: number, flowTail = 1): StockInput {
  const n = 70;
  const bars = Array.from({ length: n }, (_, i) => {
    const c = from + ((to - from) * i) / (n - 1);
    return { date: `2026-06-${String(i + 1).padStart(3, "0")}`, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1e6 };
  });
  const value = bars.map((_, i) => (i >= n - 5 ? 10e9 * flowTail : 10e9));
  return { ticker, sector, companyName: null, bars, value };
}

describe("computeSectorStrength", () => {
  const input = [
    stock("A1", "Ngân hàng", 20, 30, 2),
    stock("A2", "Ngân hàng", 10, 14, 2),
    stock("A3", "Ngân hàng", 50, 65, 2),
    stock("B1", "Bất động sản", 30, 20),
    stock("B2", "Bất động sản", 12, 9),
    stock("B3", "Bất động sản", 40, 33),
    stock("C1", "Dầu khí", 20, 21),
    stock("C2", "Dầu khí", 20, 20.5),
    stock("C3", "Dầu khí", 20, 19.8),
    stock("D1", "Y tế", 10, 15),
  ];
  const r = computeSectorStrength(input);

  it("ngành tăng mạnh + dòng tiền vào xếp đầu, ngành giảm xếp cuối", () => {
    const names = r.sectors.map((s) => s.sector);
    expect(names[0]).toBe("Ngân hàng");
    expect(r.sectors[0].trend).toBe("lead");
    expect(r.sectors[0].breadth).toBe(100);
    expect(r.sectors[0].flow).toBeCloseTo(2);
    const bds = r.sectors.find((s) => s.sector === "Bất động sản")!;
    expect(bds.trend).toBe("weak");
    expect(bds.ret20).toBeLessThan(0);
  });

  it("ngành < 3 mã đánh dấu kém tin cậy và xếp sau", () => {
    const yte = r.sectors[r.sectors.length - 1];
    expect(yte.sector).toBe("Y tế");
    expect(yte.lowConfidence).toBe(true);
    expect(yte.trend).not.toBe("lead");
  });

  it("thị trường chung + tỷ trọng dòng tiền cộng đủ 100%", () => {
    expect(r.market.count).toBe(10);
    expect(r.sectors.reduce((s, x) => s + x.share, 0)).toBeCloseTo(100);
    expect(r.date).toBe("2026-06-070");
  });

  it("bỏ qua mã thiếu data", () => {
    const short = { ...stock("Z", "Ngân hàng", 1, 2), bars: stock("Z", "X", 1, 2).bars.slice(0, 30) };
    expect(computeSectorStrength([short]).sectors).toHaveLength(0);
  });

  it("top picks không lấy từ ngành yếu", () => {
    for (const p of r.topPicks) expect(p.sectorTrend).not.toBe("weak");
  });
});

describe("điểm ngành", () => {
  it("luôn trong 0–100 kể cả ngành ít mã nằm ngoài pool", () => {
    const r = computeSectorStrength([
      stock("A1", "Ngân hàng", 20, 22),
      stock("A2", "Ngân hàng", 20, 21),
      stock("A3", "Ngân hàng", 20, 21.5),
      stock("B1", "Dầu khí", 20, 19),
      stock("B2", "Dầu khí", 20, 19.5),
      stock("B3", "Dầu khí", 20, 19.2),
      stock("Y", "Y tế", 10, 20, 5),
      stock("V", "Viễn thông", 20, 10, 0.2),
    ]);
    for (const s of r.sectors) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("formatSectorStrength", () => {
  it("escape tên ngành có & cho parse_mode HTML", () => {
    const r = computeSectorStrength([
      stock("F1", "Thực phẩm & Đồ uống", 20, 25, 2),
      stock("F2", "Thực phẩm & Đồ uống", 20, 24, 2),
      stock("F3", "Thực phẩm & Đồ uống", 20, 26, 2),
    ]);
    const text = formatSectorStrength(r);
    expect(text).toContain("Thực phẩm &amp; Đồ uống");
    expect(text).not.toMatch(/& Đồ/);
  });

  it("không có data → câu thông báo", () => {
    expect(formatSectorStrength(computeSectorStrength([]))).toMatch(/Chưa đủ dữ liệu/);
  });
});
