/**
 * Position sizing theo rủi ro cố định:
 * qty = floor(NAV × riskPct / ((entry − stop) × 1000) / 100) × 100
 * (giá tính nghìn đồng → nhân 1000 ra VND; lot 100)
 */
export function positionSize(opts: {
  navVnd: number;
  riskPct: number;
  entry: number;
  stop: number;
  lotSize?: number;
}): { qty: number; riskVnd: number; valueVnd: number } {
  const lot = opts.lotSize ?? 100;
  const perShareRiskVnd = (opts.entry - opts.stop) * 1000;
  if (perShareRiskVnd <= 0) return { qty: 0, riskVnd: 0, valueVnd: 0 };
  const riskBudget = opts.navVnd * opts.riskPct;
  const rawQty = riskBudget / perShareRiskVnd;
  const qty = Math.floor(rawQty / lot) * lot;
  return {
    qty,
    riskVnd: qty * perShareRiskVnd,
    valueVnd: qty * opts.entry * 1000,
  };
}
