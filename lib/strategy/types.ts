import type { Bar } from "../data/types";

export interface SignalCandidate {
  entry: number; // nghìn đồng — giá tham chiếu đặt LO phiên sau
  stop: number;
  target: number;
  rr: number;
  reason: string;
}

export interface StrategyContext {
  ticker: string;
  exchange: string;
  bandPct: number;
  bars: Bar[]; // ascending, bar cuối = phiên vừa đóng cửa
  params: Record<string, number>;
}

export type StrategyFn = (ctx: StrategyContext) => SignalCandidate | null;
