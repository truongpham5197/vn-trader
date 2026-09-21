import { describe, expect, it } from "vitest";
import { extractHorizon, formatTopPicks, inSession, zoneDistancePct, type Pick } from "./top-picks";

const pick = (over: Partial<Pick> = {}): Pick => ({
  ticker: "GAS",
  sector: "Năng lượng",
  label: "breakout-20",
  watch: false,
  entry: 91.28,
  stop: 87.2,
  target: 99.4,
  qty: 400,
  buyZone: [90.1, 91.8],
  horizon: "5–15 phiên",
  reason: "close 91.28 > đỉnh 20phiên 90.10, vol 2.1x",
  last: 91.3,
  ref: 90.22,
  ...over,
});

describe("extractHorizon", () => {
  it("bóc kỳ vọng phiên từ plan", () => {
    expect(extractHorizon("SL = 87.2; TP = 99.4. Kỳ vọng 5–15 phiên; thoát sớm.")).toBe(
      "5–15 phiên",
    );
    expect(extractHorizon("Kỳ vọng 1–5 phiên.")).toBe("1–5 phiên");
    expect(extractHorizon(null)).toBeNull();
    expect(extractHorizon("không có kỳ vọng")).toBeNull();
  });
});

describe("zoneDistancePct", () => {
  it("0 khi trong vùng, dương khi lệch", () => {
    expect(zoneDistancePct(91, [90, 92])).toBe(0);
    expect(zoneDistancePct(94, [90, 92])).toBeCloseTo((2 / 94) * 100);
    expect(zoneDistancePct(88, [90, 92])).toBeCloseTo((2 / 88) * 100);
  });
});

describe("inSession", () => {
  it("T2–T6 9:00–15:00", () => {
    expect(inSession(new Date("2026-09-21T09:00:00"))).toBe(true); // T2
    expect(inSession(new Date("2026-09-21T14:59:00"))).toBe(true);
    expect(inSession(new Date("2026-09-21T15:00:00"))).toBe(false);
    expect(inSession(new Date("2026-09-21T08:59:00"))).toBe(false);
    expect(inSession(new Date("2026-09-20T10:00:00"))).toBe(false); // CN
  });
});

describe("formatTopPicks", () => {
  it("đủ trường: giá vs TC, vùng mua, TP/SL, horizon, lý do — escape HTML", () => {
    const msg = formatTopPicks([pick(), pick({ ticker: "MWG", watch: true, qty: null })], "2026-09-18");
    expect(msg).toContain("TOP 2 MÃ TIỀM NĂNG");
    expect(msg).toContain("tín hiệu 2026-09-18");
    expect(msg).toContain("+1.20% vs TC 90.22");
    expect(msg).toContain("trong vùng mua");
    expect(msg).toContain("90.10–91.80");
    expect(msg).toContain("TP <b>99.40</b> (+8.9%)");
    expect(msg).toContain("5–15 phiên");
    expect(msg).toContain("&gt; đỉnh"); // escape dấu >
    expect(msg).toContain("watchlist");
    expect(msg).toContain("400cp");
  });

  it("giá trên vùng → tag 🔺", () => {
    const msg = formatTopPicks([pick({ last: 95 })], null);
    expect(msg).toContain("trên vùng");
    expect(msg).not.toContain("trong vùng mua");
  });
});
