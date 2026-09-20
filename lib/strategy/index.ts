import type { PrismaClient } from "@prisma/client";
import { breakout20, breakout20Exit, BREAKOUT20_DEFAULTS } from "./breakout20";
import { pullbackMa20, pullbackMa20Exit, PULLBACK_DEFAULTS } from "./pullback-ma20";
import { rsi2Revert, rsi2Exit, RSI2_DEFAULTS } from "./rsi2";
import type { StrategyDef } from "./types";

export const STRATEGIES: Record<string, StrategyDef> = {
  "breakout-20": { fn: breakout20, defaults: BREAKOUT20_DEFAULTS, shouldExit: breakout20Exit },
  "pullback-ma20": { fn: pullbackMa20, defaults: PULLBACK_DEFAULTS, shouldExit: pullbackMa20Exit },
  "rsi2-revert": { fn: rsi2Revert, defaults: RSI2_DEFAULTS, shouldExit: rsi2Exit },
};

/** Đảm bảo strategy có row trong DB, trả về danh sách enabled. */
export async function ensureStrategies(prisma: PrismaClient) {
  for (const [type, s] of Object.entries(STRATEGIES)) {
    await prisma.strategy.upsert({
      where: { name: type },
      update: {},
      create: { name: type, type, params: JSON.stringify(s.defaults) },
    });
  }
  return prisma.strategy.findMany({ where: { enabled: true } });
}
