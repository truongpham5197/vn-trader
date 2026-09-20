import { describe, expect, it } from "vitest";
import { breakout20, BREAKOUT20_DEFAULTS, roundTick } from "./breakout20";
import type { Bar } from "../data/types";

function makeBar(date: string, close: number, volume = 1_000_000, h?: number): Bar {
  return { date, open: close, high: h ?? close, low: close, close, volume };
}

function flatBars(n: number, price = 50, volume = 1_000_000): Bar[] {
  return Array.from({ length: n }, (_, i) =>
    makeBar(`2026-08-${String((i % 28) + 1).padStart(2, "0")}`, price, volume),
  );
}

const CTX = { ticker: "TST", exchange: "HOSE", bandPct: 0.07 };

describe("breakout20", () => {
  it("phát tín hiệu khi close vượt đỉnh 20 phiên + vol spike", () => {
    const bars = flatBars(40, 50, 1_000_000);
    bars.push(makeBar("2026-09-18", 51, 2_000_000, 51.2)); // breakout + vol 2x
    const sig = breakout20({ ...CTX, bars, params: BREAKOUT20_DEFAULTS });
    expect(sig).not.toBeNull();
    expect(sig!.entry).toBe(51);
    expect(sig!.stop).toBeLessThan(51);
    expect(sig!.target).toBeGreaterThan(51);
  });

  it("không tín hiệu khi close không vượt đỉnh", () => {
    const bars = flatBars(40, 50);
    bars.push(makeBar("2026-09-18", 50, 3_000_000));
    expect(breakout20({ ...CTX, bars, params: BREAKOUT20_DEFAULTS })).toBeNull();
  });

  it("không tín hiệu khi vol không đủ", () => {
    const bars = flatBars(40, 50, 1_000_000);
    bars.push(makeBar("2026-09-18", 51, 1_100_000)); // vol chỉ 1.1x
    expect(breakout20({ ...CTX, bars, params: BREAKOUT20_DEFAULTS })).toBeNull();
  });

  it("không tín hiệu khi giá chạm trần (không đuổi trần)", () => {
    const bars = flatBars(40, 50, 1_000_000);
    const ceilingClose = 50 * 1.07; // trần HOSE từ prev close 50
    bars.push(makeBar("2026-09-18", ceilingClose, 5_000_000, ceilingClose));
    expect(breakout20({ ...CTX, bars, params: BREAKOUT20_DEFAULTS })).toBeNull();
  });

  it("không tín hiệu khi thiếu dữ liệu", () => {
    const bars = flatBars(20);
    expect(breakout20({ ...CTX, bars, params: BREAKOUT20_DEFAULTS })).toBeNull();
  });
});

describe("roundTick", () => {
  it("bước giá theo khung giá VN", () => {
    expect(roundTick(8.23)).toBeCloseTo(8.25);
    expect(roundTick(25.34)).toBeCloseTo(25.3);
    expect(roundTick(67.73)).toBeCloseTo(67.5);
  });
});
