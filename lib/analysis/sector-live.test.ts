import { describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
import { inLiveWindow, newOpportunities } from "./sector-live";
import { inVnSession, sessionElapsed } from "../vn-time";
import type { SectorStrength } from "./sector-strength";

// Date "giờ VN" giả lập như vnNow() trả về — 2026-09-21 là thứ 2
const at = (hhmm: string, day = "2026-09-21") => new Date(`${day}T${hhmm}:00`);

describe("giờ phiên", () => {
  it("inVnSession / inLiveWindow", () => {
    expect(inVnSession(at("08:59"))).toBe(false);
    expect(inVnSession(at("10:00"))).toBe(true);
    expect(inVnSession(at("15:10"))).toBe(false);
    expect(inLiveWindow(at("15:10"))).toBe(true);
    expect(inLiveWindow(at("16:00"))).toBe(false);
    expect(inVnSession(at("10:00", "2026-09-20"))).toBe(false); // chủ nhật
  });

  it("sessionElapsed bỏ giờ nghỉ trưa", () => {
    expect(sessionElapsed(at("10:15"))).toBeCloseTo(75 / 255);
    expect(sessionElapsed(at("12:30"))).toBeCloseTo(150 / 255);
    expect(sessionElapsed(at("14:00"))).toBeCloseTo(210 / 255);
    expect(sessionElapsed(at("15:30"))).toBe(1);
    expect(sessionElapsed(at("09:00"))).toBe(0.05);
  });
});

describe("newOpportunities", () => {
  const pick = (ticker: string, close: number) => ({
    ticker, sector: "Ngân hàng", close, chgPct: 0, setup: "", score: 70, note: "", plain: "", companyName: null,
    buyZone: [20, 21] as [number, number], stop: 19, target: 24, upsidePct: 15, riskPct: 7, sectorTrend: "lead" as const,
  });
  const r = {
    date: "2026-09-21",
    market: { count: 0, ret5: 0, ret20: 0, breadth: 0, flow: 1 },
    sectors: [
      { sector: "Ngân hàng", trend: "lead" },
      { sector: "Thép", trend: "strong" },
    ],
    topPicks: [pick("ACB", 20.5), pick("TCB", 22), pick("VCB", 21)],
  } as unknown as SectorStrength;

  it("chỉ mã trong vùng mua + ngành dẫn đầu, bỏ cái đã báo", () => {
    const a = newOpportunities(r, { date: "2026-09-21", picks: [], leads: [] });
    expect(a.picks.map((p) => p.ticker)).toEqual(["ACB", "VCB"]);
    expect(a.leads).toEqual(["Ngân hàng"]);
    const b = newOpportunities(r, { date: "2026-09-21", picks: ["ACB"], leads: ["Ngân hàng"] });
    expect(b.picks.map((p) => p.ticker)).toEqual(["VCB"]);
    expect(b.leads).toEqual([]);
  });
});
