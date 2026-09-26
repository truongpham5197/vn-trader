/**
 * Tham số nhận xét/đề xuất hiển thị trên web — module THUẦN (không import prisma)
 * để client component dùng được. Tự học chỉnh trong ADVICE_LADDER (lib/advice-learn.ts);
 * không bao giờ tự nghĩ giá trị ngoài thang. Giá trị hiện dùng lưu ở Setting "adviceParams".
 */
export interface AdviceParams {
  /** "sát cắt lỗ/chốt lời" — giá còn cách mốc ≤ x% (lib/risk/levels.ts). */
  nearPct: number;
  /** "Đang xanh, chill đi" — lãi net ≥ +x% (lib/risk/advice.ts). */
  pnlUp: number;
  /** "Đỏ nhẹ, chưa tới mức" — lỗ net ≤ −x% (lib/risk/advice.ts). */
  pnlDown: number;
  /** Ngưỡng R:R sau phí để gắn nhãn "Có thể cân nhắc" (lib/analysis/opportunity.ts). */
  minNetRR: number;
  /** 1 mã chiếm ≥ x giá trị rổ → cảnh báo dồn vị thế (tỷ lệ, 0.5 = 50%). */
  heavyShare: number;
}

export const ADVICE_DEFAULTS: AdviceParams = {
  nearPct: 3,
  pnlUp: 3,
  pnlDown: 3,
  minNetRR: 1.2,
  heavyShare: 0.5,
};

/** Thang giá trị được phép — nudge chỉ dịch ±1 bậc, manual cũng trong thang. */
export const ADVICE_LADDER: Record<keyof AdviceParams, number[]> = {
  nearPct: [2, 3, 4, 5],
  pnlUp: [2, 3, 4, 5, 7],
  pnlDown: [2, 3, 4, 5, 7],
  minNetRR: [0.8, 1, 1.2, 1.5, 2],
  heavyShare: [0.4, 0.5, 0.6, 0.7],
};

/**
 * Tham số tự học được — heavyShare chỉ chỉnh tay (độ tập trung rổ là lựa chọn
 * chủ quan, không có kết quả đúng để chấm).
 */
export const ADVICE_LEARNABLE = ["nearPct", "pnlUp", "pnlDown", "minNetRR"] as const;
export type LearnableParam = (typeof ADVICE_LEARNABLE)[number];
