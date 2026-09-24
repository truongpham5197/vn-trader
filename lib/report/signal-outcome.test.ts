import { describe, expect, it } from "vitest";
import { losingRecord, outcomeStats, recordLine, resolveOutcome, type OutcomeBar } from "./signal-outcome";

const bar = (date: string, open: number, high: number, low: number, close = open): OutcomeBar => ({ date, open, high, low, close });
const sig = { entry: 20, stop: 19, target: 22, buyHigh: 20.2, strategyType: "pullback-ma20" };

describe("resolveOutcome", () => {
  it("không về vùng mua trong 3 phiên → missed", () => {
    const bars = [bar("d1", 21, 21.5, 20.5), bar("d2", 21, 22, 20.6), bar("d3", 22, 22.5, 21)];
    expect(resolveOutcome(sig, bars)?.outcome).toBe("missed");
    expect(resolveOutcome(sig, bars.slice(0, 2))).toBeNull();
  });

  it("chạm cắt lỗ trước T+2 không tính — bán sớm nhất phiên thứ 3 kể từ khớp", () => {
    const bars = [bar("d1", 20, 20.1, 18.5), bar("d2", 19.5, 19.8, 18.8), bar("d3", 19.5, 22.5, 19.2)];
    const o = resolveOutcome(sig, bars)!;
    expect(o.fill).toBe(20);
    expect(o.outcome).toBe("win");
    expect(o.exit).toBe(22);
    expect(o.pct).toBeLessThan(10); // có trừ phí
    expect(o.r).toBeCloseTo(2);
  });

  it("cùng nến chạm cả cắt lỗ và chốt → tính cắt lỗ", () => {
    const bars = [bar("d1", 20, 20, 19.9), bar("d2", 20, 20, 19.9), bar("d3", 20, 22.5, 18.5)];
    expect(resolveOutcome(sig, bars)?.outcome).toBe("loss");
  });

  it("mở cửa gap dưới cắt lỗ → bán giá mở cửa, lỗ quá 1R", () => {
    const bars = [bar("d1", 20, 20, 19.9), bar("d2", 20, 20, 19.9), bar("d3", 18, 18.2, 17.5)];
    const o = resolveOutcome(sig, bars)!;
    expect(o.exit).toBe(18);
    expect(o.r!).toBeLessThan(-1);
  });

  it("hết số phiên giữ → time, chưa đủ phiên → null", () => {
    const flat = Array.from({ length: 12 }, (_, i) => bar(`d${String(i + 1).padStart(2, "0")}`, 20, 20.5, 19.6, 20.3));
    expect(resolveOutcome(sig, flat.slice(0, 8))).toBeNull();
    const o = resolveOutcome(sig, flat)!;
    expect(o.outcome).toBe("time");
    expect(o.date).toBe("d11"); // khớp d01 + 10 phiên giữ
  });
});

describe("thành tích", () => {
  const rows = (n: number, outcome: string, pct: number, r: number) => Array.from({ length: n }, () => ({ outcome, outcomePct: pct, outcomeR: r }));

  it("đủ mẫu + TB âm → đang thua", () => {
    const s = outcomeStats([...rows(8, "win", 5, 2), ...rows(14, "loss", -5, -1), ...rows(3, "missed", 0, 0)]);
    expect(s.resolved).toBe(22);
    expect(s.missed).toBe(3);
    expect(losingRecord(s)).toBe(true);
    expect(recordLine(s, "X")).toContain("ĐANG THUA");
  });

  it("mẫu ít không kết luận", () => {
    const s = outcomeStats(rows(3, "loss", -5, -1));
    expect(losingRecord(s)).toBe(false);
    expect(recordLine(s, "X")).toContain("chưa đủ để kết luận");
    expect(recordLine(outcomeStats([]), "X")).toContain("chưa có gợi ý");
  });
});
