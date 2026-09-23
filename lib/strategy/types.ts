import type { Bar } from "../data/types";

export interface SignalCandidate {
  entry: number; // nghìn đồng — giá tham chiếu đặt LO phiên sau
  stop: number;
  target: number;
  rr: number;
  reason: string; // vì sao có tín hiệu
  plan?: string; // vì sao target đó + kỳ vọng bao nhiêu phiên
  buyZone?: [number, number]; // dải giá còn được phép vào — không đuổi ngoài vùng
}

export interface StrategyContext {
  ticker: string;
  exchange: string;
  bandPct: number;
  bars: Bar[]; // ascending, bar cuối = phiên vừa đóng cửa
  params: Record<string, number>;
}

export type StrategyFn = (ctx: StrategyContext) => SignalCandidate | null;

/** Exit rule bổ sung ngoài stop/target — backtest + watcher dùng. */
export type ExitCheckFn = (ctx: {
  bars: Bar[]; // tới ngày hiện tại
  entryPrice: number;
  daysHeld: number;
  params: Record<string, number>;
}) => string | null; // trả về exitReason hoặc null

export interface StrategyDef {
  fn: StrategyFn;
  defaults: Record<string, number>;
  shouldExit?: ExitCheckFn;
  /** Số nến tối thiểu với params đã merge defaults — scan nạp theo max strategy đang bật. */
  requiredBars?: (params: Record<string, number>) => number;
}
