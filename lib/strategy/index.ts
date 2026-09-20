import type { PrismaClient } from "@prisma/client";
import { breakout20, BREAKOUT20_DEFAULTS } from "./breakout20";
import type { StrategyFn } from "./types";

export const STRATEGIES: Record<string, { fn: StrategyFn; defaults: Record<string, number> }> = {
  "breakout-20": { fn: breakout20, defaults: BREAKOUT20_DEFAULTS },
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
