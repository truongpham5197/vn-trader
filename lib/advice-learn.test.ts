import { describe, expect, it } from "vitest";
import {
  bandStat,
  decideParam,
  minNetRRStat,
  nearPctStat,
  pnlDownStat,
  pnlUpStat,
  type Episode,
  type ResolvedSignal,
} from "./advice-learn";

const ep = (o: Partial<Episode>): Episode => ({
  entry: 100,
  stop: null,
  target: null,
  minLow: null,
  maxHigh: null,
  pnl: 0,
  closeDate: "2026-09-20",
  ...o,
});

describe("bandStat", () => {
  it("precision/recall/F1 đúng công thức, null khi thiếu mẫu", () => {
    const s = bandStat([
      { fired: true, matched: true },
      { fired: true, matched: true },
      { fired: true, matched: false },
      { fired: false, matched: true },
      { fired: false, matched: true },
      { fired: false, matched: false },
    ]);
    expect(s).toMatchObject({ fired: 3, matched: 2, total: 6 });
    expect(s.precision).toBeCloseTo(2 / 3);
    expect(s.recall).toBeCloseTo(0.5); // 2/4 lệnh đúng hướng được bắt
    expect(s.f1).toBeCloseTo(0.5714, 3);
    expect(bandStat([]).f1).toBeNull();
    expect(bandStat([{ fired: false, matched: false }]).f1).toBeNull();
  });
});

describe("nearPctStat — sát cắt lỗ/chốt lời gộp 2 phía", () => {
  const eps: Episode[] = [
    ep({ stop: 90, minLow: 91, pnl: -5 }), // sát SL rồi chết — cảnh báo đúng
    ep({ stop: 90, minLow: 91, pnl: 10 }), // sát SL mà vẫn lãi — cảnh báo hớ
    ep({ stop: 90, minLow: 94, pnl: -3 }), // chết nhưng chưa từng sát SL
    ep({ target: 110, maxHigh: 109, pnl: 8 }), // sát TP rồi lãi
    ep({ target: 110, maxHigh: 109, pnl: -2 }), // sát TP mà lỗ
    ep({ target: 110, maxHigh: 100, pnl: -5 }), // chưa từng sát TP, lỗ
  ];

  it("x=2 chỉ tính sự kiện thật sự lọt vào vùng 2%", () => {
    const s = nearPctStat(eps, 2);
    // fired: 2 lệnh sát SL (91 ≤ 91.8) + 2 lệnh sát TP (109 ≥ 107.8)
    expect(s.total).toBe(6);
    expect(s.fired).toBe(4);
    expect(s.matched).toBe(2); // lệnh 1 (chết) + lệnh 4 (lãi)
    // hits=3 (lệnh 1,3 phía stop chết + lệnh 4 phía target lãi; lệnh 6 phía target lỗ không tính hit)
    expect(s.recall).toBeCloseTo(2 / 3);
    expect(s.f1).toBeCloseTo(0.5714, 3);
  });

  it("x=5 bắt thêm lệnh minLow=94 — F1 tốt hơn khi dữ liệu ủng hộ", () => {
    const s = nearPctStat(eps, 5);
    expect(s.fired).toBe(5); // thêm lệnh minLow 94 ≤ 94.5
    expect(s.matched).toBe(3); // hits=3 → recall 1.0
    expect(s.f1).toBeCloseTo(0.75);
  });
});

describe("pnlUpStat / pnlDownStat — ngưỡng lãi/lỗ net", () => {
  const eps: Episode[] = [
    ep({ maxHigh: 104, minLow: 96, pnl: 8 }), // từng +3%net và −3%net, kết lãi
    ep({ maxHigh: 104, minLow: 96, pnl: -8 }), // từng +3%net và −3%net, kết lỗ
    ep({ maxHigh: 102, minLow: 98, pnl: 5 }), // không đạt ±3%net, kết lãi
    ep({ maxHigh: 102, minLow: 98, pnl: -5 }), // không đạt ±3%net, kết lỗ
  ];

  it("pnlUp: chỉ lệnh high đạt +x% net mới tính là đã hiện «đang xanh»", () => {
    const s = pnlUpStat(eps, 3);
    // 104×0.9975/100.15 ≈ +3.6% → 2 lệnh fired; 102 → +1.9% không fired
    expect(s.fired).toBe(2);
    expect(s.matched).toBe(1); // chỉ lệnh kết lãi
    expect(s.precision).toBeCloseTo(0.5);
    expect(s.recall).toBeCloseTo(0.5); // 1/2 lệnh lãi được bắt
  });

  it("pnlDown: chỉ lệnh low chạm −x% net mới tính là đã hiện «đỏ nhẹ»", () => {
    const s = pnlDownStat(eps, 3);
    expect(s.fired).toBe(2);
    expect(s.matched).toBe(1); // chỉ lệnh kết lỗ
    expect(s.f1).toBeCloseTo(0.5);
  });

  it("ngưỡng lớn hơn khớp ít lệnh hơn", () => {
    expect(pnlUpStat(eps, 5).fired).toBe(0); // +3.6%net < 5% → không lệnh nào
    expect(pnlDownStat(eps, 5).fired).toBe(0);
  });
});

describe("minNetRRStat — ngưỡng «có thể cân nhắc»", () => {
  const sig = (entry: number, stop: number, target: number, outcomePct: number): ResolvedSignal =>
    ({ entry, stop, target, outcomePct, outcomeDate: "2026-09-20" });
  const sigs: ResolvedSignal[] = [
    sig(100, 95, 110, 5), // R:R ~2 → lãi
    sig(100, 95, 110, -3), // R:R ~2 → lỗ
    sig(100, 97, 104, 4), // R:R ~1.3 → lãi
    sig(100, 97, 104, -4), // R:R ~1.3 → lỗ
  ];

  it("ngưỡng cao chỉ giữ gợi ý R:R lớn", () => {
    const lo = minNetRRStat(sigs, 1);
    expect(lo.fired).toBe(4);
    const hi = minNetRRStat(sigs, 1.5);
    expect(hi.fired).toBe(2); // chỉ 2 kèo R:R~2
    expect(hi.matched).toBe(1);
  });
});

describe("decideParam — cổng đủ mẫu + F1 hơn rõ mới đổi", () => {
  const stat = (total: number, fired: number, f1: number | null) => ({
    fired, matched: fired, total, precision: f1, recall: f1, f1,
  });
  const cur = { x: 3, stat: stat(20, 10, 0.5) };

  it("thiếu mẫu hoặc F1 hiện tại null → giữ nguyên", () => {
    expect(decideParam({ x: 3, stat: stat(10, 5, 0.5) }, [{ x: 2, stat: stat(10, 5, 0.9) }])).toBeNull();
    expect(decideParam({ x: 3, stat: stat(20, 10, null) }, [{ x: 2, stat: stat(20, 10, 0.9) }])).toBeNull();
  });

  it("lân cận F1 hơn ≥0.05 và đủ lần hiện → đổi; không thì giữ", () => {
    expect(decideParam(cur, [{ x: 4, stat: stat(20, 8, 0.56) }])?.x).toBe(4);
    expect(decideParam(cur, [{ x: 4, stat: stat(20, 8, 0.54) }])).toBeNull(); // chưa đủ margin
    expect(decideParam(cur, [{ x: 4, stat: stat(20, 5, 0.9) }])).toBeNull(); // hiện quá ít lần
  });

  it("nhiều lân cận đạt chuẩn → chọn F1 cao nhất", () => {
    const pick = decideParam(cur, [
      { x: 2, stat: stat(20, 8, 0.7) },
      { x: 4, stat: stat(20, 8, 0.62) },
    ]);
    expect(pick?.x).toBe(2);
  });
});
