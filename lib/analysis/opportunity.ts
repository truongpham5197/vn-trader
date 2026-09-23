import { netPnl } from "../fees";

export type OpportunityState = "watch" | "waiting" | "actionable" | "extended" | "invalid" | "expired" | "stale" | "blocked";

export interface OpportunityInput {
  confirmed: boolean;
  price: number | null;
  stop: number;
  target: number;
  buyZone: [number, number] | null;
  fresh: boolean;
  expired?: boolean;
  liquid?: boolean;
  marketWeak?: boolean;
  minNetRR?: number;
}

export interface OpportunityAssessment {
  state: OpportunityState;
  actionable: boolean;
  label: string;
  detail: string;
  netRR: number | null;
}

/** Cùng quy tắc cho web/bot: vùng giá không thay thế xác nhận chiến lược. */
export function assessOpportunity(p: OpportunityInput): OpportunityAssessment {
  let netRR: number | null = null;
  const result = (state: OpportunityState, label: string, detail: string): OpportunityAssessment =>
    ({ state, actionable: state === "actionable", label, detail, netRR });
  if (p.expired) return result("expired", "Hết hạn", "Đã có phiên nến mới hơn; không tái sử dụng kế hoạch cũ để mở vị thế.");
  if (![p.stop, p.target, ...(p.buyZone ?? [])].every((v) => Number.isFinite(v) && v > 0)
    || p.stop >= p.target || (p.buyZone && p.buyZone[0] > p.buyZone[1])) {
    return result("invalid", "Kế hoạch không hợp lệ", "Cần tính lại vùng giá, cắt lỗ và mục tiêu.");
  }
  if (!p.fresh || p.price === null || !Number.isFinite(p.price) || p.price <= 0) {
    return result("stale", "Chờ dữ liệu mới", "Chưa có giá đủ mới để đánh giá; giá dự phòng không phải giá realtime.");
  }
  if (p.price <= p.stop) return result("invalid", "Đã thủng cắt lỗ", "Kịch bản đã mất hiệu lực; không mua chỉ vì giá rẻ hơn.");
  if (p.price >= p.target) return result("invalid", "Đã tới mục tiêu", "Không mở mới theo mục tiêu cũ; cần đánh giá lại.");
  const risk = -netPnl(p.price, p.stop, 1);
  netRR = risk > 0 ? netPnl(p.price, p.target, 1) / risk : null;
  if (p.liquid === false) return result("blocked", "Thanh khoản chưa đạt", "Theo dõi được, nhưng không gợi ý mở vị thế mới.");
  if (p.marketWeak) return result("blocked", "Ưu tiên đứng ngoài", "Độ rộng thị trường suy yếu; bộ lọc thận trọng, chưa chứng minh cải thiện lợi nhuận.");
  if (p.buyZone && p.price > p.buyZone[1]) return result("extended", "Không mua đuổi", "Giá đã vượt vùng dự kiến; chờ kế hoạch mới.");
  if (!p.confirmed) return result("watch", "Chờ xác nhận", "Setup theo dõi, chưa phải tín hiệu mua. Cần nến đóng thỏa điều kiện chiến lược.");
  if (!p.buyZone || p.price < p.buyZone[0]) return result("waiting", "Chờ vùng giá", "Đã xác nhận kỹ thuật nhưng giá chưa nằm trong vùng dự kiến.");
  if (netRR === null || netRR < (p.minNetRR ?? 1.2)) {
    return result("blocked", "Lời/lỗ chưa phù hợp", "R:R sau phí tại giá hiện tại dưới ngưỡng thận trọng 1,2; không phải xác suất thắng.");
  }
  return result("actionable", "Có thể cân nhắc", "Đã xác nhận, còn trong vùng giá; kiểm tra vốn/rủi ro riêng trước khi quyết định. Chưa chứng minh có lãi.");
}
