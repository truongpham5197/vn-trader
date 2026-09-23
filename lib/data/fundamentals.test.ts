import { describe, expect, it } from "vitest";
import { formatFundamentalsTg, fundamentalVerdict, summarizeFundamentals, type Fundamentals } from "./fundamentals";

const q = (d: string, revenue: number, profit: number) => ({
  period: `Q${Math.ceil(Number(d.slice(5, 7)) / 3)}/${d.slice(0, 4)}`,
  fiscalDate: d,
  revenue: revenue * 1e9,
  profit: profit * 1e9,
});
const NOW = new Date("2026-09-23").getTime();
const base: Fundamentals = {
  ticker: "FPT",
  isBank: false,
  pe: 12.5,
  pb: 3.1,
  roe: 0.24,
  divYield: 0.027,
  marketCap: 124_870e9,
  quarters: [
    q("2026-06-30", 13789, 2568),
    q("2026-03-31", 12480, 2487),
    q("2025-12-31", 20225, 2510),
    q("2025-09-30", 17205, 2435),
    q("2025-06-30", 16625, 2257),
    q("2025-03-31", 16058, 2174),
    q("2024-12-31", 17608, 2095),
    q("2024-09-30", 15903, 2089),
  ],
  news: [],
};

describe("summarizeFundamentals", () => {
  it("so sánh lợi nhuận/doanh thu với cùng kỳ năm trước", () => {
    const notes = summarizeFundamentals(base, NOW);
    expect(notes[0]).toEqual({ tone: "good", text: "Lợi nhuận Q2/2026: 2,568 tỷ (+13.8% so cùng kỳ)" });
    expect(notes[1]).toEqual({ tone: "bad", text: "Doanh thu Q2/2026: 13,789 tỷ (−17.1% so cùng kỳ)" });
    expect(notes.find((n) => n.text.startsWith("Lợi nhuận 4 quý"))?.tone).toBe("good");
    expect(notes.find((n) => n.text.startsWith("ROE"))?.tone).toBe("good");
    expect(fundamentalVerdict(notes).tone).toBe("good");
  });

  it("quý lỗ → cảnh báo, chuyển lỗ sang lãi → tích cực", () => {
    const loss = { ...base, roe: null, quarters: [q("2026-06-30", 100, -50), q("2025-06-30", 100, 20)] };
    expect(summarizeFundamentals(loss, NOW)[0]).toEqual({ tone: "bad", text: "Q2/2026 LỖ 50 tỷ (cùng kỳ lãi 20 tỷ)" });
    expect(fundamentalVerdict(summarizeFundamentals(loss, NOW)).tone).toBe("bad");
    const turn = { ...base, quarters: [q("2026-06-30", 100, 30), q("2025-06-30", 100, -20)] };
    expect(summarizeFundamentals(turn, NOW)[0].text).toContain("chuyển từ lỗ sang lãi");
  });

  it("tăng trưởng trên nền thấp hiện dạng gấp N lần", () => {
    const low = { ...base, quarters: [q("2026-06-30", 100, 104), q("2025-06-30", 100, 10)] };
    expect(summarizeFundamentals(low, NOW)[0].text).toBe("Lợi nhuận Q2/2026: 104 tỷ (gấp 10.4 lần so cùng kỳ)");
  });

  it("số liệu quý quá cũ → cảnh báo", () => {
    const old = { ...base, quarters: [q("2025-12-31", 100, 10)] };
    expect(summarizeFundamentals(old, NOW).some((n) => n.text.includes("đã cũ"))).toBe(true);
  });
});

describe("formatFundamentalsTg", () => {
  it("escape tiêu đề tin + link, bỏ tiền tố mã", () => {
    const f = { ...base, news: [{ date: "2026-09-15", title: "FPT: Nghị quyết <HĐQT> & cổ tức", url: 'https://x.vn/a?b=1&c="2"', type: "Nghị quyết" }] };
    const s = formatFundamentalsTg(f, NOW);
    expect(s).toContain('<a href="https://x.vn/a?b=1&amp;c=&quot;2&quot;">Nghị quyết &lt;HĐQT&gt; &amp; cổ tức</a>');
    expect(s).toContain("15/09 [Nghị quyết]");
    const many = formatFundamentalsTg(
      {
        ...base,
        news: [
          { date: "2026-09-20", title: "a", url: null, type: "Công bố" },
          { date: "2026-09-19", title: "b", url: null, type: "Báo chí" },
          { date: "2026-09-10", title: "c", url: null, type: "GD cổ đông lớn/nội bộ" },
          { date: "2026-09-01", title: "d", url: null, type: "BCTC" },
        ],
      },
      NOW,
    );
    expect(many.split("\n").slice(-3).map((l) => l.at(-1))).toEqual(["c", "d", "a"]);
    expect(s.startsWith("🏢 <b>Kinh doanh</b> — ✅")).toBe(true);
  });
});
