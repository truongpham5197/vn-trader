import { describe, expect, it } from "vitest";
import { buildDigest, rankForUser, type DigestInput, type DigestSignal } from "./personal-digest";
import { outcomeStats } from "./signal-outcome";
import { PERSONAS } from "../persona";

const s = (ticker: string, over: Partial<DigestSignal> = {}): DigestSignal => ({
  id: ticker.length,
  ticker,
  sector: "Ngân hàng",
  strategy: "pullback-ma20",
  entry: 20,
  stop: 19,
  target: 22,
  rr: 2,
  buyZone: [19.6, 20.1],
  reason: "x",
  ...over,
});

const base: DigestInput = {
  persona: PERSONAS[0],
  name: "Linh",
  seed: "2026-09-24",
  signals: [],
  holdings: [],
  watchlist: [],
  nav: 100e6,
  cash: 100e6,
  riskPct: 0.01,
  records: {},
  graded: [],
  exits: [],
};

describe("rankForUser", () => {
  it("mã đang giữ không vào gợi ý mua; trùng ngành bị trừ điểm; theo dõi được cộng", () => {
    const r = rankForUser({
      ...base,
      signals: [s("VCB"), s("HPG", { sector: "Thép" }), s("FPT", { sector: "CNTT" }), s("ACB")],
      holdings: [{ ticker: "VCB", sector: "Ngân hàng", price: 90, stop: 85 }],
      watchlist: ["FPT"],
    });
    expect(r.held).toEqual(["VCB"]);
    expect(r.picks.map((p) => p.s.ticker)).toEqual(["FPT", "HPG", "ACB"]);
    expect(r.picks[2].notes.join()).toContain("cùng ngành với VCB");
  });

  it("gộp mã nhiều chiến lược, KL bị chặn theo tiền mặt", () => {
    const r = rankForUser({ ...base, cash: 5e6, signals: [s("HPG"), s("HPG", { strategy: "breakout-20", rr: 1.5 })] });
    expect(r.picks).toHaveLength(1);
    expect(r.picks[0].strategies).toHaveLength(2);
    expect(r.picks[0].qty).toBe(200); // 5tr / 20k → 200cp (theo rủi ro là 10.000cp)
  });

  it("chiến lược đang thua bị gỡ khỏi gợi ý", () => {
    const losing = outcomeStats(Array.from({ length: 25 }, (_, i) => ({ outcome: i < 5 ? "win" : "loss", outcomePct: i < 5 ? 4 : -4, outcomeR: 0 })));
    const r = rankForUser({ ...base, signals: [s("HPG", { strategy: "breakout-20" }), s("FPT")], records: { "breakout-20": losing } });
    expect(r.picks.map((p) => p.s.ticker)).toEqual(["FPT"]);
    expect(r.weak).toEqual(["HPG"]);
  });
});

describe("buildDigest", () => {
  it("không có gì → null", () => expect(buildDigest(base)).toBeNull());

  it("2 user khác phong cách → tin khác nhau, cùng số liệu", () => {
    const i = { ...base, signals: [s("HPG")] };
    const a = buildDigest({ ...i, persona: PERSONAS[0] })!;
    const b = buildDigest({ ...i, persona: PERSONAS[1] })!;
    expect(a).not.toBe(b);
    for (const t of [a, b]) {
      expect(t).toContain("HPG");
      expect(t).toContain("cắt lỗ 19.00");
      expect(t).toContain("không phải lời hứa lãi");
    }
  });

  it("owner + user trùng phong cách → biến thể khác nhau, tin vẫn khác", () => {
    const i = { ...base, signals: [s("HPG")], persona: PERSONAS[2] };
    const texts = [0, 1, 2, 3].map((variant) => buildDigest({ ...i, variant })!);
    expect(new Set(texts).size).toBe(4);
  });

  it("trả bài: gợi ý user đã mua bị thủng → xin lỗi; escape tên user", () => {
    const t = buildDigest({
      ...base,
      name: "<b>x</b>",
      graded: [{ ticker: "HPG", strategy: "pullback-ma20", date: "2026-09-10", outcome: "loss", pct: -5.4, taken: true }],
      records: { "pullback-ma20": outcomeStats([{ outcome: "loss", outcomePct: -5.4, outcomeR: -1 }]) },
    })!;
    expect(t).toContain("thủng cắt lỗ (-5.4% sau phí)");
    expect(t).toContain("app xin lỗi");
    expect(t).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(t).not.toContain("<b>x</b>");
  });

  it("mã đang giữ thủng cắt lỗ → nhắc xử lý trước khi mua mới, không ra lệnh", () => {
    const t = buildDigest({ ...base, signals: [s("HPG")], holdings: [{ ticker: "MWG", sector: "Bán lẻ", price: 40, stop: 42 }] })!;
    expect(t).toContain("MWG của Linh đang dưới cắt lỗ");
    expect(t).toContain("app không bán hộ");
  });
});
