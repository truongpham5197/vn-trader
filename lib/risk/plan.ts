/**
 * Gợi ý khối lượng cá nhân — mô hình thận trọng, không phải chiến lược tối ưu.
 * Giá nghìn đồng; value/risk/cash là VND.
 */
import { BUY_FEE, netPnl } from "../fees";
import { positionSize } from "./sizing";

export const PLAN_LIMITS = {
  lot: 100,
  maxPositionPct: 0.2,
  maxSectorPct: 0.35,
  maxPortfolioRiskPct: 0.05,
  maxLiquidityPct: 0.01,
} as const;

export const PLAN_ASSUMPTIONS = [
  "Mô hình mục tiêu — không đảm bảo khớp, cắt lỗ, chốt lời hay T+2.",
  "Trần cố định trong code: 20% NAV/mã, 35% ngành, 5% rủi ro danh mục, 1% GTGD TB20.",
  "Không tối ưu chiến lược; chỉ ước lượng thận trọng, không đặt lệnh.",
  "Vị thế đang giữ: giá live nếu có, không thì giá vốn. Thiếu cắt lỗ → không gợi ý thêm rủi ro (không coi rủi ro = 0).",
] as const;

export type PlanHolding = {
  ticker: string;
  sector: string | null;
  qty: number;
  entry: number;
  price: number | null;
  stop: number | null;
};

export type PlanInput = {
  ticker: string;
  sector: string | null;
  entry: number;
  stop: number | null;
  target: number | null;
  nav: number;
  cash: number;
  riskPct: number;
  avg20ValueVnd: number | null;
  holdings: PlanHolding[];
};

export type PlanCaps = {
  risk: number;
  cash: number;
  position: number;
  sector: number;
  portfolioRisk: number | null;
  liquidity: number | null;
};

export type PlanResult = {
  qty: number;
  reasons: string[];
  caps: PlanCaps;
  binding: string[];
  riskVnd: number;
  valueVnd: number;
  costVnd: number;
  lossAtStop: number;
  gainAtTarget: number;
  assumptions: string[];
};

const lotFloor = (n: number, lot = PLAN_LIMITS.lot) =>
  !Number.isFinite(n) || n < lot ? 0 : Math.floor(n / lot) * lot;

const mark = (h: PlanHolding) => h.price ?? h.entry;
const valueVnd = (qty: number, px: number) => qty * px * 1000;
const sectorKey = (ticker: string, sector: string | null) => sector ?? `__ticker:${ticker}`;

function finitePos(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function estimatePlan(input: PlanInput): PlanResult {
  const assumptions = [...PLAN_ASSUMPTIONS];
  const reasons: string[] = [];
  const emptyCaps: PlanCaps = { risk: 0, cash: 0, position: 0, sector: 0, portfolioRisk: 0, liquidity: 0 };
  const zero = (extra: string[]): PlanResult => ({
    qty: 0,
    reasons: [...extra, ...reasons],
    caps: emptyCaps,
    binding: [],
    riskVnd: 0,
    valueVnd: 0,
    costVnd: 0,
    lossAtStop: 0,
    gainAtTarget: 0,
    assumptions,
  });

  const { entry, stop, target, nav, cash, riskPct } = input;
  if (![entry, nav, riskPct].every(finitePos) || (stop != null && !Number.isFinite(stop)) || (target != null && !Number.isFinite(target))) {
    return zero(["Giá/vốn không hợp lệ"]);
  }
  if (stop == null || !finitePos(stop)) return zero(["Thiếu cắt lỗ — không gợi ý khối lượng"]);
  if (target == null || !finitePos(target)) return zero(["Thiếu chốt lời — không gợi ý khối lượng"]);
  if (!(stop < entry && entry < target)) return zero(["Cần cắt lỗ < giá mua < chốt lời"]);
  if (!Number.isFinite(cash)) return zero(["Tiền mặt không hợp lệ"]);

  const perShareRisk = (entry - stop) * 1000;
  const sized = positionSize({ navVnd: nav, riskPct, entry, stop, lotSize: PLAN_LIMITS.lot });
  const cashQty = lotFloor(cash / (entry * 1000 * (1 + BUY_FEE)));

  const existingTicker = input.holdings
    .filter((h) => h.ticker === input.ticker)
    .reduce((s, h) => s + valueVnd(h.qty, mark(h)), 0);
  const posRoom = PLAN_LIMITS.maxPositionPct * nav - existingTicker;
  const positionQty = lotFloor(posRoom / (entry * 1000));

  const key = sectorKey(input.ticker, input.sector);
  const existingSector = input.holdings
    .filter((h) => sectorKey(h.ticker, h.sector) === key)
    .reduce((s, h) => s + valueVnd(h.qty, mark(h)), 0);
  const sectorRoom = PLAN_LIMITS.maxSectorPct * nav - existingSector;
  const sectorQty = lotFloor(sectorRoom / (entry * 1000));

  const missingStop = input.holdings.some((h) => h.stop == null || !Number.isFinite(h.stop));
  let portfolioRiskQty: number | null;
  if (missingStop) {
    portfolioRiskQty = null;
    reasons.push("Vị thế đang giữ thiếu cắt lỗ — không gợi ý thêm rủi ro (không coi rủi ro = 0)");
  } else {
    const existingRisk = input.holdings.reduce((s, h) => {
      const px = mark(h);
      const r = (px - h.stop!) * 1000 * h.qty;
      return s + Math.max(0, r);
    }, 0);
    const room = PLAN_LIMITS.maxPortfolioRiskPct * nav - existingRisk;
    portfolioRiskQty = lotFloor(room / perShareRisk);
  }

  let liquidityQty: number | null = null;
  if (input.avg20ValueVnd != null && Number.isFinite(input.avg20ValueVnd) && input.avg20ValueVnd > 0) {
    liquidityQty = lotFloor((input.avg20ValueVnd * PLAN_LIMITS.maxLiquidityPct) / (entry * 1000));
  } else {
    reasons.push("Chưa có GTGD TB20 — bỏ trần thanh khoản");
  }

  const caps: PlanCaps = {
    risk: sized.qty,
    cash: cashQty,
    position: positionQty,
    sector: sectorQty,
    portfolioRisk: portfolioRiskQty,
    liquidity: liquidityQty,
  };

  const candidates: [string, number][] = [
    ["risk", caps.risk],
    ["cash", caps.cash],
    ["position", caps.position],
    ["sector", caps.sector],
  ];
  if (caps.portfolioRisk == null) candidates.push(["portfolioRisk", 0]);
  else candidates.push(["portfolioRisk", caps.portfolioRisk]);
  if (caps.liquidity != null) candidates.push(["liquidity", caps.liquidity]);

  const qty = Math.max(0, Math.min(...candidates.map(([, n]) => n)));
  const binding = candidates.filter(([, n]) => n === qty).map(([k]) => k);

  if (qty === 0) {
    if (caps.risk === 0) reasons.push("Ngân sách rủi ro/lệnh không đủ 1 lot");
    if (caps.cash === 0) reasons.push("Không đủ tiền mặt (đã tính phí mua)");
    if (caps.position === 0) reasons.push("Đã chạm trần 20% NAV/mã");
    if (caps.sector === 0) reasons.push("Đã chạm trần 35% NAV/ngành");
    if ((caps.portfolioRisk ?? 0) === 0 && caps.portfolioRisk !== null)
      reasons.push("Đã chạm trần 5% rủi ro danh mục");
    if (caps.liquidity === 0) reasons.push("Trần 1% GTGD TB20 không đủ 1 lot");
    if (!reasons.length) reasons.push("Khối lượng gợi ý = 0");
  } else {
    const labels: Record<string, string> = {
      risk: `rủi ro ${riskPct * 100}% NAV/lệnh`,
      cash: "tiền mặt + phí mua",
      position: "trần 20% NAV/mã",
      sector: "trần 35% NAV/ngành",
      portfolioRisk: "trần 5% rủi ro danh mục",
      liquidity: "trần 1% GTGD TB20",
    };
    const bound = binding.map((k) => labels[k]).filter(Boolean);
    if (bound.length) reasons.push(`Bị chặn bởi: ${bound.join(", ")}`);
  }

  const costVnd = qty * entry * 1000 * (1 + BUY_FEE);
  return {
    qty,
    reasons,
    caps,
    binding,
    riskVnd: qty * perShareRisk,
    valueVnd: valueVnd(qty, entry),
    costVnd,
    lossAtStop: netPnl(entry, stop, qty),
    gainAtTarget: netPnl(entry, target, qty),
    assumptions,
  };
}
