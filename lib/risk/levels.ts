/** Khoảng "sát" cắt lỗ / chốt lời: giá còn cách mốc ≤3%. */
export const NEAR_PCT = 3;

export type LevelKind = "stop-broken" | "near-stop" | "target-hit" | "near-target";

export interface LevelState {
  kind: LevelKind;
  /** Nhãn ngắn cho badge. */
  label: string;
  /** Câu đầy đủ: vị trí so với mốc + nên làm gì. */
  detail: string;
  tone: "loss" | "gain";
}

const f = (v: number) => String(+v.toFixed(2));
const p1 = (v: number) => v.toFixed(1);

/**
 * Giá so với cắt lỗ/chốt lời — tách rõ "đã thủng" (giá ≤ cắt lỗ) với "sát" (giá còn trên cắt lỗ ≤3%).
 * Trước đây gộp chung `giá ≤ SL×1.02` → giá 85.3 dưới SL 92.5 vẫn ghi "sát cắt lỗ".
 */
export function levelState(price: number | null, stop: number | null, target: number | null): LevelState | null {
  if (price === null || !(price > 0)) return null;
  if (stop && price <= stop) {
    const under = (1 - price / stop) * 100;
    return {
      kind: "stop-broken",
      label: under >= 0.05 ? `đã thủng cắt lỗ −${p1(under)}%` : "chạm cắt lỗ",
      detail: `Giá ${f(price)} ${under >= 0.05 ? `đã xuống dưới mức cắt lỗ ${f(stop)} (thấp hơn ${p1(under)}%)` : `chạm đúng mức cắt lỗ ${f(stop)}`} — theo kế hoạch nên bán để giữ vốn, hoặc sửa lại mức cắt lỗ nếu nhập nhầm.`,
      tone: "loss",
    };
  }
  if (target && price >= target) {
    const over = (price / target - 1) * 100;
    return {
      kind: "target-hit",
      label: over >= 0.05 ? `đã vượt chốt lời +${p1(over)}%` : "chạm chốt lời",
      detail: `Giá ${f(price)} ${over >= 0.05 ? `đã vượt mức chốt lời ${f(target)} (cao hơn ${p1(over)}%)` : `chạm đúng mức chốt lời ${f(target)}`} — cân nhắc chốt lời toàn bộ/một phần hoặc nâng cắt lỗ lên để giữ lãi.`,
      tone: "gain",
    };
  }
  if (stop && price <= stop * (1 + NEAR_PCT / 100)) {
    const gap = (price / stop - 1) * 100;
    return {
      kind: "near-stop",
      label: `sát cắt lỗ (còn ${p1(gap)}%)`,
      detail: `Giá ${f(price)} cao hơn mức cắt lỗ ${f(stop)} chỉ ${p1(gap)}% — giảm thêm là chạm, chuẩn bị bán theo kế hoạch.`,
      tone: "loss",
    };
  }
  if (target && price >= target * (1 - NEAR_PCT / 100)) {
    const gap = (1 - price / target) * 100;
    return {
      kind: "near-target",
      label: `gần chốt lời (còn ${p1(gap)}%)`,
      detail: `Giá ${f(price)} thấp hơn mức chốt lời ${f(target)} chỉ ${p1(gap)}%.`,
      tone: "gain",
    };
  }
  return null;
}
