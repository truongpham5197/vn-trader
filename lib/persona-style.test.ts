import { describe, expect, it } from "vitest";
import { PERSONAS } from "./persona";
import { LINE_KEYS, STYLES, adviceStyle } from "./persona-style";
import { adviceKey, positionAdvice, voicedBookAdvice, voicedPositionAdvice, type BookPosition } from "./risk/advice";

const row = (over: Partial<BookPosition> & { ticker: string }): BookPosition => ({
  price: 100, stop: 92, target: 110, pnlPct: 0, sessionsHeld: 3, qty: 100, entry: 100, ...over,
});
const book = [row({ ticker: "GAS", price: 85, pnlPct: -15 }), row({ ticker: "FPT", price: 96, pnlPct: -4 }), row({ ticker: "VNM", stop: null })];

describe("persona-style", () => {
  it("mỗi phong cách có đủ bộ chữ, không ký tự phá HTML, vẫn nói không bán hộ", () => {
    for (const p of PERSONAS) {
      const k = STYLES[p.id];
      expect(k, p.id).toBeTruthy();
      for (const key of LINE_KEYS) expect(k.pos[key], `${p.id}.${key}`).toBeTruthy();
      expect(k.noSell).toContain("không bán hộ");
      expect(JSON.stringify(k)).not.toMatch(/[<>&]/);
    }
  });

  it("nhãn vị thế gốc map đủ khóa", () => {
    for (const price of [null, 85, 93, 108, 111, 100]) {
      const a = positionAdvice({ price, stop: 92, target: 110, pnlPct: 0, sessionsHeld: 3 });
      expect(adviceKey(a.line), a.line).toBeTruthy();
    }
  });

  it("đổi giọng → toàn bộ lời khuyên/giải thích cả rổ đổi văn phong, số liệu giữ nguyên", () => {
    const texts = PERSONAS.map((p) => {
      const a = voicedBookAdvice(book, adviceStyle(p.id))!;
      return [a.headline, a.why, ...a.steps, a.protect, ...a.notes.flatMap((n) => [n.verdict, n.why])].join("\n");
    });
    expect(new Set(texts).size).toBe(PERSONAS.length);
    for (const t of texts) {
      expect(t).toContain("GAS");
      expect(t).toContain("không bán hộ");
      expect(t).not.toContain("Lời khuyên");
    }
  });

  it("dòng từng mã đổi theo giọng, chi tiết giữ nguyên cảnh báo", () => {
    const lines = PERSONAS.map((p) => voicedPositionAdvice({ price: 85, stop: 92, target: 110, pnlPct: -15, sessionsHeld: 3 }, adviceStyle(p.id)));
    expect(new Set(lines.map((l) => l.line)).size).toBe(PERSONAS.length);
    for (const l of lines) expect(l.detail).toContain("không phải lệnh bán");
  });

  it("cùng phong cách, khác biến thể → tiêu đề khác thán từ", () => {
    const h = [0, 1, 2].map((v) => voicedBookAdvice(book, adviceStyle("bep", v))!.headline);
    expect(new Set(h).size).toBe(3);
  });

  it("nhãn trạng thái gợi ý giữ nhãn gốc + đuôi theo giọng", () => {
    const st = adviceStyle("me");
    expect(st.opp("extended", "Không mua đuổi")).toBe("Không mua đuổi · đừng mua con");
    expect(st.opp("lạ", "X")).toBe("X");
  });
});
