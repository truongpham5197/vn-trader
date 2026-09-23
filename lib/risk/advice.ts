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

export interface BookPosition {
  ticker: string;
  price: number | null;
  stop: number | null;
  target: number | null;
  pnlPct: number | null;
  sessionsHeld: number;
  qty: number;
  entry: number;
}

export interface BookAdvice {
  headline: string;
  why: string;
  steps: string[];
  protect: string;
  tone: AdviceTone;
}

const join = (xs: string[]) => xs.join(", ");
const short = (xs: string[]) => (xs.length <= 4 ? join(xs) : `${xs.slice(0, 3).join(", ")} và ${xs.length - 3} mã nữa`);

/** Hướng xử lý cả rổ đang giữ — cho người đang tập. Theo kế hoạch đã đặt, không phải dự báo lãi. */
export function bookAdvice(rows: BookPosition[]): BookAdvice | null {
  if (!rows.length) return null;
  const tagged = rows.map((p) => ({ ...p, line: positionAdvice(p).line }));
  const of = (line: string) => tagged.filter((p) => p.line === line).map((p) => p.ticker);
  const sellNow = of("Bán để giữ vốn");
  const sellLater = of("Bán khi cổ phiếu về");
  const setStop = of("Đặt cắt lỗ");
  const nearStop = of("Chuẩn bị bán");
  const takeNow = of("Chốt hoặc khóa lãi");
  const takeLater = of("Chốt khi cổ phiếu về");
  const takePart = of("Sẵn sàng chốt một phần");
  const setTarget = of("Đặt chốt lời");
  const trail = of("Giữ, có thể kéo cắt lỗ");
  const hold = of("Giữ theo kế hoạch");
  const waitPrice = of("Chờ giá mới");

  const values = tagged.map((p) => ({ ticker: p.ticker, v: (p.price ?? p.entry) * p.qty }));
  const total = values.reduce((s, x) => s + x.v, 0);
  const biggest = [...values].sort((a, b) => b.v - a.v)[0];
  const share = total > 0 && biggest ? biggest.v / total : 0;
  const heavy = biggest && share >= 0.5 && (rows.length >= 3 || share >= 0.6) ? biggest.ticker : null;

  const steps: string[] = [];
  if (sellNow.length) steps.push(`Bán ${join(sellNow)} ngay. Cổ phiếu đã về tài khoản, giá đã thủng cắt lỗ.`);
  if (sellLater.length) steps.push(`Ghi sẵn bán ${join(sellLater)} khi cổ phiếu về. Hôm nay chưa bán được vì chưa đủ 2 phiên (T+2).`);
  if (setStop.length) steps.push(`Đặt cắt lỗ cho ${join(setStop)} trước khi giữ tiếp. Không có mức thoát thì không biết lúc nào phải bán.`);
  if (nearStop.length) steps.push(`Canh ${join(nearStop)}: giảm thêm là chạm cắt lỗ. Chuẩn bị bán, không mua thêm.`);
  if (takeNow.length) steps.push(`${join(takeNow)} đã tới chốt lời. Bán một phần hoặc toàn bộ, hoặc nâng cắt lỗ lên sát giá hiện tại để lãi không quay thành lỗ.`);
  if (takeLater.length) steps.push(`${join(takeLater)} đã tới chốt lời nhưng chưa bán được — chốt khi cổ phiếu về.`);
  if (takePart.length) steps.push(`${join(takePart)} gần chốt lời. Có thể bán bớt; phần giữ thì kéo cắt lỗ lên.`);
  if (setTarget.length) steps.push(`Đặt chốt lời cho ${join(setTarget)} để biết khi nào bán, kẻo giữ mãi.`);
  if (trail.length) steps.push(`${join(trail)} đang lãi, còn trong kế hoạch. Giữ đến chốt lời. Muốn khóa lãi thì nâng cắt lỗ lên trên giá mua.`);
  if (hold.length) steps.push(`${join(hold)} còn giữa cắt lỗ và chốt lời. Giữ. Đừng bán vì sốt ruột, đừng mua thêm để gỡ.`);
  if (waitPrice.length) steps.push(`${join(waitPrice)} chưa có giá mới — chưa làm gì với các mã này.`);

  let headline: string;
  let tone: AdviceTone;
  if (sellNow.length) {
    headline = `Việc đầu tiên: bán ${short(sellNow)} để giữ vốn`;
    tone = "loss";
  } else if (setStop.length) {
    headline = `Việc đầu tiên: đặt cắt lỗ cho ${short(setStop)}`;
    tone = "loss";
  } else if (sellLater.length) {
    headline = `Đánh dấu bán ${short(sellLater)} ngay khi cổ phiếu về`;
    tone = "loss";
  } else if (nearStop.length) {
    headline = `Chuẩn bị bán ${short(nearStop)} — đừng mua thêm`;
    tone = "loss";
  } else if (takeNow.length || takeLater.length) {
    const xs = [...takeNow, ...takeLater];
    headline = `Chốt hoặc khóa lãi ${short(xs)}`;
    tone = "gain";
  } else {
    headline = "Giữ theo kế hoạch — chưa có mã phải bán gấp";
    tone = "neutral";
  }

  const why: string[] = [];
  if (sellNow.length || sellLater.length) {
    why.push(`${join([...sellNow, ...sellLater])} đã xuống dưới mức cắt lỗ bạn đặt. Mức đó là số lỗ bạn chấp nhận từ trước. Giữ tiếp là đang đánh ngoài kế hoạch.`);
  }
  if (setStop.length) {
    why.push(`${join(setStop)} chưa có mức thoát. Người mới hay giữ đến khi lỗ lớn rồi mới bán — đặt cắt lỗ trước thì lỗ có trần.`);
  }
  if (nearStop.length) {
    why.push(`${join(nearStop)} sát cắt lỗ. Mua thêm lúc này chỉ kéo giá mua trung bình xuống, không cứu được lệnh nếu giá tiếp tục giảm.`);
  }
  if (takeNow.length || takeLater.length || takePart.length) {
    why.push(`${join([...takeNow, ...takeLater, ...takePart])} đã tới hoặc gần mức chốt. Lãi chưa bán vẫn mất nếu giá quay lại.`);
  }
  if (heavy) why.push(`${heavy} chiếm phần lớn số đang giữ. Mã này giảm là cả phần cổ phiếu giảm theo.`);
  if (!why.length) why.push(`${rows.length} mã còn trong vùng kế hoạch. Chưa có lý do bán sớm hay mở thêm.`);

  const protect = [
    "Giữ vốn nghĩa là lỗ có trần. Cắt lỗ là trần đó: thủng thì bán, đừng chờ về giá mua.",
    "Không mua thêm mã đang lỗ để kéo giá vốn. Giá tiếp tục giảm thì lỗ to hơn, không phải được giá rẻ.",
    heavy ? `Đừng mua thêm ${heavy}.` : "Đừng dồn phần lớn tiền vào một mã.",
    sellNow.length || setStop.length || sellLater.length
      ? "Chưa xử lý các việc trên thì đừng mua mã mới."
      : "Mỗi lệnh mới cũng cần cắt lỗ trước khi mua. Chưa cần mở thêm thì đứng ngoài.",
  ].join(" ");

  return { headline, why: why.join(" "), steps, protect, tone };
}
