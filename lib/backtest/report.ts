import {
  ENGINE_VERSION,
  BACKTEST_LIMITATIONS,
  type BacktestConfig,
  type BtMetrics,
} from "./engine";

export { ENGINE_VERSION, BACKTEST_LIMITATIONS };

export interface StoredBtCfg {
  engineVersion: number;
  navVnd: number;
  riskPct: number;
  maxPositions: number;
  buyFeePct: number;
  sellFeePct: number;
  sellTaxPct: number;
  slippagePct: number;
  settleDays: number;
  universe: string;
  fromDate: string;
  toDate: string;
}

export function serializeRunParams(opts: {
  strategyParams: Record<string, number>;
  cfg: BacktestConfig;
  universe: string;
  fromDate: string;
  toDate: string;
}): string {
  const _bt: StoredBtCfg = {
    engineVersion: ENGINE_VERSION,
    navVnd: opts.cfg.navVnd,
    riskPct: opts.cfg.riskPct,
    maxPositions: opts.cfg.maxPositions,
    buyFeePct: opts.cfg.buyFeePct,
    sellFeePct: opts.cfg.sellFeePct,
    sellTaxPct: opts.cfg.sellTaxPct,
    slippagePct: opts.cfg.slippagePct,
    settleDays: opts.cfg.settleDays,
    universe: opts.universe,
    fromDate: opts.fromDate,
    toDate: opts.toDate,
  };
  return JSON.stringify({ ...opts.strategyParams, _bt });
}

export function parseStoredCfg(paramsJson: string | null | undefined): StoredBtCfg | null {
  if (!paramsJson) return null;
  try {
    const p = JSON.parse(paramsJson) as { _bt?: StoredBtCfg };
    return p?._bt ?? null;
  } catch {
    return null;
  }
}

export function isLegacyRun(
  metrics: Partial<BtMetrics> | { engineVersion?: number } | null | undefined,
  paramsJson?: string | null,
): boolean {
  if (metrics && "engineVersion" in metrics && metrics.engineVersion === ENGINE_VERSION) return false;
  const stored = parseStoredCfg(paramsJson ?? undefined);
  return stored?.engineVersion !== ENGINE_VERSION;
}
