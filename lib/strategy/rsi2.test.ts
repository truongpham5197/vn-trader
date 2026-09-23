import { describe, expect, it } from "vitest";
import { rsi2Revert, RSI2_DEFAULTS } from "./rsi2";
import type { Bar } from "../data/types";

function makeBar(date: string, close: number, volume = 1_000_000): Bar {
  return { date, open: close, high: close, low: close, close, volume };
}

const CTX = { ticker: "TST", exchange: "HOSE", bandPct: 0.07 };

describe("rsi2Revert", () => {
  it("plan nội suy stopPct/rr/timeStop, rr sau tick, buyZone hợp lệ", () => {
    const bars: Bar[] = [];
    for (let i = 0; i < 58; i++) bars.push(makeBar(`2026-01-${String((i % 28) + 1).padStart(2, "0")}`, 30 + i * 0.5));
    bars.push(makeBar("2026-09-17", 56));
    bars.push(makeBar("2026-09-18", 52));
    const sig = rsi2Revert({
      ...CTX,
      bars,
      params: { ...RSI2_DEFAULTS, stopPct: 6, rrTarget: 2, timeStopDays: 8, rsiSellAbove: 80 },
    });
    expect(sig).not.toBeNull();
    expect(sig!.plan).toContain("6%");
    expect(sig!.plan).toContain("2×rủi ro");
    expect(sig!.plan).toContain("8 phiên");
    expect(sig!.plan).toContain("RSI>80");
    expect(sig!.plan).toMatch(/Kỳ vọng/);
    const actualRr = (sig!.target - sig!.entry) / (sig!.entry - sig!.stop);
    expect(sig!.rr).toBeCloseTo(Math.round(actualRr * 100) / 100);
    expect(sig!.buyZone![0]).toBeGreaterThan(0);
    expect(sig!.buyZone![0]).toBeLessThan(sig!.buyZone![1]);
  });
});
