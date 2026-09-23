import { describe, expect, it } from "vitest";
import { STRATEGIES } from "./index";
import { BREAKOUT20_DEFAULTS } from "./breakout20";
import { PULLBACK_DEFAULTS } from "./pullback-ma20";
import { RSI2_DEFAULTS } from "./rsi2";

describe("STRATEGIES.requiredBars", () => {
  it("pullback mặc định cần 66 nến (MA50+ATR14+2), không phải 60", () => {
    expect(STRATEGIES["pullback-ma20"].requiredBars?.(PULLBACK_DEFAULTS)).toBe(66);
  });

  it("breakout mặc định donchian+atr+2", () => {
    expect(STRATEGIES["breakout-20"].requiredBars?.(BREAKOUT20_DEFAULTS)).toBe(36);
  });

  it("rsi2 mặc định trendMa+10", () => {
    expect(STRATEGIES["rsi2-revert"].requiredBars?.(RSI2_DEFAULTS)).toBe(60);
  });

  it("requiredBars theo params custom, không hardcode", () => {
    expect(STRATEGIES["pullback-ma20"].requiredBars?.({ ...PULLBACK_DEFAULTS, maSlow: 100 })).toBe(116);
    expect(STRATEGIES["breakout-20"].requiredBars?.({ ...BREAKOUT20_DEFAULTS, donchian: 30, atrPeriod: 20 })).toBe(52);
    expect(STRATEGIES["rsi2-revert"].requiredBars?.({ ...RSI2_DEFAULTS, trendMa: 80 })).toBe(90);
  });
});
