import { describe, expect, it } from "vitest";
import { pullbackMa20, PULLBACK_DEFAULTS } from "./pullback-ma20";
import type { Bar } from "../data/types";

function makeBar(date: string, close: number, volume: number, low?: number, high?: number): Bar {
  return { date, open: close, high: high ?? close, low: low ?? close, close, volume };
}

function risingBars(n: number): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const close = 30 + i * 0.3;
    return makeBar(`2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`, close, 1_000_000, close - 0.1, close + 0.1);
  });
}

const CTX = { ticker: "TST", exchange: "HOSE", bandPct: 0.07 };

describe("pullbackMa20", () => {
  it("plan nội suy params, rr sau tick, không khẳng định lực bán, buyZone hợp lệ", () => {
    const bars = risingBars(70);
    const last = bars[bars.length - 1];
    // chạm MA20: hạ low, vol khô
    bars[bars.length - 1] = makeBar(last.date, last.close, 200_000, last.close - 3, last.close + 0.1);
    const sig = pullbackMa20({
      ...CTX,
      bars,
      params: { ...PULLBACK_DEFAULTS, atrStopMult: 2.5, rrTarget: 1.2, maSlow: 40 },
    });
    expect(sig).not.toBeNull();
    expect(sig!.plan).toContain("2.5×ATR");
    expect(sig!.plan).toContain("1.2×rủi ro");
    expect(sig!.plan).not.toMatch(/vào − 1\.5×ATR/);
    expect(sig!.plan).not.toMatch(/vào \+ 2×rủi ro/);
    expect(sig!.plan).toMatch(/Kỳ vọng/);
    expect(sig!.reason).not.toMatch(/lực bán yếu/);
    const actualRr = (sig!.target - sig!.entry) / (sig!.entry - sig!.stop);
    expect(sig!.rr).toBeCloseTo(Math.round(actualRr * 100) / 100);
    expect(sig!.buyZone![0]).toBeGreaterThan(0);
    expect(sig!.buyZone![0]).toBeLessThan(sig!.buyZone![1]);
  });
});
