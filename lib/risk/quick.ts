import { roundTick } from "../strategy/breakout20";

/** Mặc định cắt lỗ −8% / chốt lời +8% theo giá vốn khi user không tự nhập (form web + API). */
export const QUICK_PCT = 8;

export const quickExit = (entry: number, pct: number) => +roundTick(entry * (1 + pct / 100)).toFixed(2);

export const quickExits = (entry: number) => ({ stop: quickExit(entry, -QUICK_PCT), target: quickExit(entry, QUICK_PCT) });
