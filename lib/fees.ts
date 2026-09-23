// Phí/thuế TCBS — pure, dùng được cả client (giá live) lẫn server
export const BUY_FEE = 0.0015;
export const SELL_FEE_TAX = 0.0015 + 0.001; // phí bán + thuế

/** P&L net (VND) sau phí mua + phí bán + thuế. Giá nghìn đồng. */
export const netPnl = (entry: number, exit: number, qty: number) =>
  exit * qty * 1000 * (1 - SELL_FEE_TAX) - entry * qty * 1000 * (1 + BUY_FEE);

/** % lãi/lỗ net nếu bán ở `price`. */
export const netPnlPct = (entry: number, price: number) => ((price * (1 - SELL_FEE_TAX)) / (entry * (1 + BUY_FEE)) - 1) * 100;
