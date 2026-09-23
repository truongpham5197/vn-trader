import { levelState } from "./levels";

export type AdviceTone = "loss" | "gain" | "neutral";

export interface PositionAdvice {
  /** Một câu để quyết định — hiện luôn. */
  line: string;
  /** Vì sao — bấm xem thêm. */
  detail: string;
  tone: AdviceTone;
}

/** Lời khuyên xử lý vị thế đang giữ, theo cắt lỗ/chốt lời đã đặt. Không phải khuyến nghị có lãi. */
export function positionAdvice(p: {
  price: number | null;
  stop: number | null;
  target: number | null;
  pnlPct: number | null;
  sessionsHeld: number;
}): PositionAdvice {
  const locked = p.sessionsHeld < 2;
  const wait = locked ? ` Chưa bán được (T+${p.sessionsHeld}) — làm khi cổ phiếu về tài khoản.` : "";
  if (p.price === null || !(p.price > 0)) {
    return { line: "Chờ giá mới", detail: "Chưa có giá đủ mới để quyết định giữ hay bán.", tone: "neutral" };
  }
  if (!p.stop) {
    return {
      line: "Đặt cắt lỗ",
      detail: "Chưa có mức cắt lỗ. Đặt trước khi giữ tiếp — không thì không biết khi nào phải bán.",
      tone: "loss",
    };
  }
  const lv = levelState(p.price, p.stop, p.target);
  if (lv?.kind === "stop-broken") {
    return {
      line: locked ? "Bán khi cổ phiếu về" : "Bán để giữ vốn",
      detail: `${lv.detail} Đừng mua thêm để gỡ.${wait}`,
      tone: "loss",
    };
  }
  if (lv?.kind === "target-hit") {
    return {
      line: locked ? "Chốt khi cổ phiếu về" : "Chốt hoặc khóa lãi",
      detail: `${lv.detail}${wait}`,
      tone: "gain",
    };
  }
  if (lv?.kind === "near-stop") {
    return {
      line: "Chuẩn bị bán",
      detail: `${lv.detail} Không mua thêm để kéo giá vốn.${wait}`,
      tone: "loss",
    };
  }
  if (lv?.kind === "near-target") {
    return {
      line: "Sẵn sàng chốt một phần",
      detail: `${lv.detail} Có thể bán một phần; phần giữ thì nâng cắt lỗ lên gần giá hiện tại.${wait}`,
      tone: "gain",
    };
  }
  if (!p.target) {
    return {
      line: "Đặt chốt lời",
      detail: "Có cắt lỗ nhưng chưa có chốt lời — đặt mức để biết khi nào bán.",
      tone: "neutral",
    };
  }
  const pnl = p.pnlPct;
  if (pnl !== null && pnl >= 3) {
    return {
      line: "Giữ, có thể kéo cắt lỗ",
      detail: `Đang lãi ${pnl.toFixed(1)}%, còn trên cắt lỗ và chưa tới chốt lời. Muốn khóa lãi thì nâng cắt lỗ lên trên giá vốn.`,
      tone: "gain",
    };
  }
  if (pnl !== null && pnl <= -3) {
    return {
      line: "Giữ theo kế hoạch",
      detail: `Đang lỗ ${pnl.toFixed(1)}% nhưng chưa chạm cắt lỗ. Giữ đến cắt lỗ hoặc chốt lời — không mua thêm để gỡ.`,
      tone: "loss",
    };
  }
  return {
    line: "Giữ theo kế hoạch",
    detail: "Giá còn giữa cắt lỗ và chốt lời. Chưa có lý do bán sớm.",
    tone: "neutral",
  };
}
