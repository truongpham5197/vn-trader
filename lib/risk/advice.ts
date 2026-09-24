import { px } from "../format";
import { netPnl } from "../fees";
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
  const wait = locked ? ` Chưa đủ T+${p.sessionsHeld} — cổ phiếu chưa về. App chỉ cảnh báo, không bán.` : "";
  if (p.price === null || !(p.price > 0)) {
    return { line: "Chờ giá mới", detail: "Chưa có giá đủ mới để cảnh báo.", tone: "neutral" };
  }
  if (!p.stop) {
    return {
      line: "Đặt cắt lỗ",
      detail: "Chưa có mức cắt lỗ. Đặt mức để có trần lỗ — app không bán hộ.",
      tone: "loss",
    };
  }
  const lv = levelState(p.price, p.stop, p.target);
  if (lv?.kind === "stop-broken") {
    return {
      line: locked ? "Cảnh báo cắt lỗ, chưa về" : "Cảnh báo cắt lỗ",
      detail: `${lv.detail} Không mua thêm để gỡ.${wait}`,
      tone: "loss",
    };
  }
  if (lv?.kind === "target-hit") {
    return {
      line: locked ? "Cảnh báo chốt lời, chưa về" : "Cảnh báo chốt lời",
      detail: `${lv.detail} App không bán hộ.${wait}`,
      tone: "gain",
    };
  }
  if (lv?.kind === "near-stop") {
    return {
      line: "Sát cắt lỗ",
      detail: `${lv.detail} Không mua thêm để kéo giá vốn.${wait}`,
      tone: "loss",
    };
  }
  if (lv?.kind === "near-target") {
    return {
      line: "Gần chốt lời",
      detail: `${lv.detail} App chỉ cảnh báo, không bảo bán.${wait}`,
      tone: "gain",
    };
  }
  if (!p.target) {
    return {
      line: "Đặt chốt lời",
      detail: "Có cắt lỗ nhưng chưa có mức chốt — đặt mức để biết khi nào tới vùng lãi. App không bán hộ.",
      tone: "neutral",
    };
  }
  const pnl = p.pnlPct;
  if (pnl !== null && pnl >= 3) {
    return {
      line: "Đang lãi, trong kế hoạch",
      detail: `Đang lãi ${pnl.toFixed(1)}%, còn trên cắt lỗ và chưa tới chốt lời. App không bảo bán. Muốn khóa lãi thì tự nâng mức cắt lỗ lên trên giá vốn.`,
      tone: "gain",
    };
  }
  if (pnl !== null && pnl <= -3) {
    return {
      line: "Đang lỗ, trong kế hoạch",
      detail: `Đang lỗ ${pnl.toFixed(1)}% nhưng chưa chạm cắt lỗ. App không bảo bán, không bảo mua thêm để gỡ.`,
      tone: "loss",
    };
  }
  return {
    line: "Trong kế hoạch",
    detail: "Giá còn giữa cắt lỗ và chốt lời. App không bảo bán.",
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

export interface HandlingNote {
  title: string;
  /** Việc áp vào rổ này — hiện luôn. */
  verdict: string;
  /** Vì sao, bám số của chính lệnh. Không phải dự báo. */
  why: string;
}

export interface BookAdvice {
  headline: string;
  why: string;
  steps: string[];
  protect: string;
  /** Trung bình giá, xử lý lỗ, chốt lời — theo kế hoạch đã đặt. */
  notes: HandlingNote[];
  tone: AdviceTone;
}

const LOT = 100;

/**
 * % giá cần tăng để về hòa vốn. Hệ thức, không phải dự báo:
 * lỗ một phần f của vốn lệnh thì cần lãi f/(1−f) trên phần còn lại.
 * pnlPct đã trừ phí. Trả null nếu không lỗ, hoặc lỗ hết (không còn gì để gỡ).
 */
export function gainToFlatPct(pnlPct: number): number | null {
  if (!(pnlPct < -0.05)) return null;
  const left = 1 + pnlPct / 100;
  if (!(left > 0)) return null;
  return (1 / left - 1) * 100;
}

const tr = (vnd: number) => `${(Math.abs(vnd) / 1e6).toFixed(2)} triệu`;

type Tagged = BookPosition & { line: string };

function recoveryBit(rows: BookPosition[]): string {
  const worst = rows
    .filter((p) => p.pnlPct !== null && p.pnlPct <= -8)
    .sort((a, b) => a.pnlPct! - b.pnlPct!)[0];
  if (!worst?.pnlPct) return "";
  const need = gainToFlatPct(worst.pnlPct);
  if (need === null) return "";
  return `${worst.ticker} đang lỗ ${Math.abs(worst.pnlPct).toFixed(1)}% so với giá vốn (đã trừ phí). Từ giá này cần tăng khoảng ${need.toFixed(1)}% mới hòa vốn. Số % cần để gỡ luôn lớn hơn số % đã lỗ — càng để sâu càng khó về.`;
}

/** Không bảo mua thêm. Điều kiện scale-in chỉ để giải thích vì sao rổ này chưa đủ, không phải tín hiệu mua. */
function averageNote(rows: Tagged[]): HandlingNote {
  const broken = rows.filter((p) => p.line === "Cảnh báo cắt lỗ" || p.line === "Cảnh báo cắt lỗ, chưa về");
  const noStop = rows.filter((p) => p.line === "Đặt cắt lỗ");
  const noPrice = rows.filter((p) => p.line === "Chờ giá mới");
  const losers = rows.filter(
    (p) => p.pnlPct !== null && p.pnlPct < -0.05 && p.stop !== null && p.price !== null && p.price > p.stop,
  );
  const near = rows.filter((p) => p.line === "Sát cắt lỗ");

  if (!rows.length || noPrice.length === rows.length) {
    return {
      title: "Trung bình giá",
      verdict: "Chưa đủ giá để xét trung bình giá.",
      why: "Chưa có giá mới thì không biết lệnh còn trên cắt lỗ hay đã phải bán. Không mua thêm trong lúc chưa đo được.",
    };
  }
  if (broken.length || noStop.length) {
    const bits: string[] = [];
    if (broken.length) bits.push(`${join(broken.map((p) => p.ticker))} đã qua cắt lỗ — kế hoạch là bán, không mua`);
    if (noStop.length) bits.push(`${join(noStop.map((p) => p.ticker))} chưa có cắt lỗ — mua thêm thì không có trần lỗ`);
    const also = losers.filter((p) => !broken.includes(p) && !noStop.includes(p));
    return {
      title: "Trung bình giá",
      verdict: `Không trung bình giá ${short([...broken, ...noStop].map((p) => p.ticker))}. Mua thêm lúc này chỉ tăng số tiền mất.`,
      why: [
        `${bits.join(". ")}.`,
        also.length ? `${join(also.map((p) => p.ticker))} đang lỗ nhưng còn trên cắt lỗ — cũng không mua thêm.` : "",
        "Giá thấp hơn giá mua không có nghĩa là rẻ hơn: app không tính giá trị doanh nghiệp, chỉ biết giá còn trên hay dưới cắt lỗ bạn đặt. Mua thêm chỉ tăng số tiền mất nếu giá tiếp tục giảm.",
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  if (losers.length) {
    const worst = [...losers].sort((a, b) => a.pnlPct! - b.pnlPct!)[0];
    const planned = netPnl(worst.entry, worst.stop!, worst.qty);
    const added = worst.price! > worst.stop! ? netPnl(worst.price!, worst.stop!, LOT) : 0;
    const parts = [
      "Trung bình giá chỉ không phá kế hoạch khi đủ cả bốn điều kiện: đã chia sẵn số lượng trước khi giá giảm, giá vẫn trên cắt lỗ, không hạ cắt lỗ, và tổng lỗ nếu chạm cắt lỗ vẫn bằng số tiền đã chấp nhận mất cho lệnh — không lớn hơn.",
      "App không kiểm tra được điều kiện đầu: bạn đã định mua thêm từ trước, hay đang muốn kéo giá vốn cho mau hòa. Muốn mau hòa không phải lý do. Đó là phản ứng khi thấy lỗ, không phải kế hoạch đổi tốt hơn.",
      "Giá thấp hơn giá mua không có nghĩa là rẻ hơn. App không tính giá trị doanh nghiệp.",
    ];
    if (planned < 0) {
      parts.push(`Với ${worst.ticker}, nếu giá chạm cắt lỗ ${px(worst.stop)} thì phần đang giữ lỗ khoảng ${tr(-planned)}.`);
    }
    if (added < 0) {
      parts.push(
        `Mua thêm 1 lô ${LOT} cổ phiếu ở ${px(worst.price)}, nếu sau đó giá chạm cắt lỗ đó, lỗ thêm khoảng ${tr(-added)}. Lỗ lớn hơn, không nhỏ hơn.`,
      );
    }
    parts.push("Phần mua mới cũng phải chờ đủ 2 phiên mới bán được. App không đối chiếu số lỗ mới với % vốn bạn đã cài, nên không kết luận là còn chỗ để mua.");
    if (near.length) {
      parts.push(`${join(near.map((p) => p.ticker))} đang sát mức phải bán. Thêm lúc này là thêm đúng chỗ kế hoạch sắp hết hiệu lực.`);
    }
    return {
      title: "Trung bình giá",
      verdict: `Chưa đủ điều kiện trung bình giá ${short(losers.map((p) => p.ticker))}. Muốn mau hòa không phải lý do để mua thêm.`,
      why: parts.join(" "),
    };
  }
  return {
    title: "Trung bình giá",
    verdict: "Không có mã đang lỗ để trung bình giá.",
    why: "Trung bình giá là mua thêm đúng mã đang lỗ để kéo giá vốn xuống. Rổ này không có mã như vậy. Không mua thêm chỉ vì một mã đang lãi.",
  };
}

function lossNote(rows: Tagged[]): HandlingNote {
  const sellNow = rows.filter((p) => p.line === "Cảnh báo cắt lỗ");
  const sellLater = rows.filter((p) => p.line === "Cảnh báo cắt lỗ, chưa về");
  const noStop = rows.filter((p) => p.line === "Đặt cắt lỗ");
  const prepare = rows.filter((p) => p.line === "Sát cắt lỗ" && (p.pnlPct === null || p.pnlPct < 0));
  const holdingLoss = rows.filter(
    (p) => p.stop !== null && p.pnlPct !== null && p.pnlPct < -0.05 && p.line !== "Cảnh báo cắt lỗ" && p.line !== "Cảnh báo cắt lỗ, chưa về" && p.line !== "Đặt cắt lỗ",
  );
  const recover = recoveryBit(rows);

  if (sellNow.length) {
    return {
      title: "Xử lý lỗ",
      verdict: `Cảnh báo: ${join(sellNow.map((p) => p.ticker))} đã thủng cắt lỗ. App không bán hộ.`,
      why: [
        "Cắt lỗ là số lỗ bạn đã chấp nhận trước khi mua. Giá đã qua mức đó — trần lỗ của kế hoạch không còn. App chỉ báo, không đặt lệnh bán.",
        recover,
        "Không kéo cắt lỗ xuống để hết cảnh báo. Kéo xuống là chấp nhận lỗ lớn hơn sau khi giá đã đi ngược.",
        sellLater.length ? `${join(sellLater.map((p) => p.ticker))} cũng đã thủng cắt lỗ, cổ phiếu chưa về. App không bán hộ.` : "",
        "Không mua mã khác để gỡ. Lệnh mới không xóa lỗ của lệnh này.",
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  if (sellLater.length) {
    return {
      title: "Xử lý lỗ",
      verdict: `Cảnh báo: ${join(sellLater.map((p) => p.ticker))} đã thủng cắt lỗ, cổ phiếu chưa về. App không bán hộ.`,
      why: [
        "Đã qua cắt lỗ. Chưa đủ 2 phiên nên cổ phiếu chưa về — app vẫn chỉ cảnh báo, không bán hộ.",
        recover,
        "Không kéo cắt lỗ xuống, không mua thêm để chờ. Không mở mã khác để gỡ.",
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  if (noStop.length) {
    return {
      title: "Xử lý lỗ",
      verdict: `Cảnh báo: ${join(noStop.map((p) => p.ticker))} chưa có cắt lỗ. Đặt mức nếu muốn có trần — app không bán hộ.`,
      why: "Chưa có mức thoát thì không có trần lỗ. Đặt mức bằng số tiền tối đa bạn chịu mất. App không bán khi thủng, chỉ báo.",
    };
  }
  if (prepare.length || holdingLoss.length) {
    const names = short([...new Set([...prepare, ...holdingLoss].map((p) => p.ticker))]);
    return {
      title: "Xử lý lỗ",
      verdict: `Cảnh báo: ${names} đang lỗ, chưa chạm cắt lỗ. App không bảo bán, không bảo mua thêm.`,
      why: [
        "Giá chưa chạm mức hủy. App không bảo bán và không bảo mua thêm.",
        "Mua thêm hay kéo cắt lỗ xuống làm rủi ro lớn hơn. Đó không phải cách làm lỗ nhỏ đi.",
        prepare.length ? `${join(prepare.map((p) => p.ticker))} sát cắt lỗ. Cảnh báo, không phải lệnh bán.` : "",
        recover,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  return {
    title: "Xử lý lỗ",
    verdict: "Chưa có lỗ cần xử lý.",
    why: "Nếu sau này giá chạm cắt lỗ thì bán. Đó là cách xử lý đã định, không phải chờ giá quay về giá mua.",
  };
}

function profitNote(rows: Tagged[]): HandlingNote {
  const takeNow = rows.filter((p) => p.line === "Cảnh báo chốt lời");
  const takeLater = rows.filter((p) => p.line === "Cảnh báo chốt lời, chưa về");
  const takePart = rows.filter((p) => p.line === "Gần chốt lời");
  const trail = rows.filter((p) => p.line === "Đang lãi, trong kế hoạch");
  const noTarget = rows.filter((p) => p.line === "Đặt chốt lời");
  const green = rows.filter((p) => p.line === "Trong kế hoạch" && p.pnlPct !== null && p.pnlPct > 0.05);
  const tightStop = rows.filter((p) => p.line === "Sát cắt lỗ" && p.pnlPct !== null && p.pnlPct > 0);
  const due = [...takeNow, ...takeLater];

  if (due.length) {
    const wait = takeLater.length && !takeNow.length;
    return {
      title: "Chốt lời",
      verdict: wait
        ? `Cảnh báo: ${short(due.map((p) => p.ticker))} đã tới chốt lời, cổ phiếu chưa về. App không bán hộ.`
        : `Cảnh báo: ${short(due.map((p) => p.ticker))} đã tới chốt lời. App không bán hộ. Lãi chưa bán có thể mất.`,
      why: [
        "Mức chốt là phần thưởng đã đặt lúc mua. Giá đã tới mức đó. App chỉ báo, không đặt lệnh bán.",
        "Không nâng mức chốt lên chỉ vì giá đã chạm. Phần lên thêm không còn trong kế hoạch.",
        takePart.length ? `${join(takePart.map((p) => p.ticker))} gần chốt lời. App không bảo bán.` : "",
        takeLater.length && takeNow.length ? `${join(takeLater.map((p) => p.ticker))} cũng đã tới chốt lời, cổ phiếu chưa về. App không bán hộ.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  if (takePart.length) {
    return {
      title: "Chốt lời",
      verdict: `Cảnh báo: ${short(takePart.map((p) => p.ticker))} gần chốt lời. App không bảo bán.`,
      why: "Gần mức đã đặt, chưa chạm. App chỉ báo. Lãi chưa bán có thể mất nếu giá quay lại — đó là sự thật, không phải lệnh bán.",
    };
  }
  if (trail.length || green.length || tightStop.length) {
    const names = short([...trail, ...green, ...tightStop].map((p) => p.ticker));
    return {
      title: "Chốt lời",
      verdict: tightStop.length && !trail.length && !green.length
        ? `Cảnh báo: ${join(tightStop.map((p) => p.ticker))} cắt lỗ đã sát giá. App không bán hộ.`
        : `Cảnh báo: ${names} đang lãi, chưa tới chốt lời. App không bảo bán.`,
      why: [
        "Đang lãi nhưng chưa tới mức chốt đã đặt. App không bảo bán.",
        trail.length ? `${join(trail.map((p) => p.ticker))} đang lãi trong kế hoạch. Muốn khóa lãi thì tự nâng mức cắt lỗ — app không bán hộ.` : "",
        tightStop.length ? `${join(tightStop.map((p) => p.ticker))}: cắt lỗ đã sát giá hiện tại. Cảnh báo, không phải lệnh bán.` : "",
        noTarget.length ? `Đặt chốt lời cho ${join(noTarget.map((p) => p.ticker))} nếu muốn có mốc. App không bán hộ.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  if (noTarget.length) {
    return {
      title: "Chốt lời",
      verdict: `Đặt chốt lời cho ${short(noTarget.map((p) => p.ticker))} nếu muốn có mốc. App không bán hộ.`,
      why: "Chưa có mức chốt thì không có mốc lãi trong kế hoạch. App không bán hộ. Đặt mức cùng lúc với cắt lỗ nếu muốn được báo khi tới.",
    };
  }
  return {
    title: "Chốt lời",
    verdict: "Chưa có lãi để báo chốt.",
    why: "App báo khi giá tới mức chốt đã đặt. Chưa tới thì không bảo bán. Lãi chưa bán không phải lãi đã có.",
  };
}

const join = (xs: string[]) => xs.join(", ");
const short = (xs: string[]) => (xs.length <= 4 ? join(xs) : `${xs.slice(0, 3).join(", ")} và ${xs.length - 3} mã nữa`);

/** Hướng xử lý cả rổ đang giữ — cho người đang tập. Theo kế hoạch đã đặt, không phải dự báo lãi. */
export function bookAdvice(rows: BookPosition[]): BookAdvice | null {
  if (!rows.length) return null;
  const tagged = rows.map((p) => ({ ...p, line: positionAdvice(p).line }));
  const of = (line: string) => tagged.filter((p) => p.line === line).map((p) => p.ticker);
  const sellNow = of("Cảnh báo cắt lỗ");
  const sellLater = of("Cảnh báo cắt lỗ, chưa về");
  const setStop = of("Đặt cắt lỗ");
  const nearStop = of("Sát cắt lỗ");
  const takeNow = of("Cảnh báo chốt lời");
  const takeLater = of("Cảnh báo chốt lời, chưa về");
  const takePart = of("Gần chốt lời");
  const setTarget = of("Đặt chốt lời");
  const trail = of("Đang lãi, trong kế hoạch");
  const hold = [...of("Trong kế hoạch"), ...of("Đang lỗ, trong kế hoạch")];
  const waitPrice = of("Chờ giá mới");

  const values = tagged.map((p) => ({ ticker: p.ticker, v: (p.price ?? p.entry) * p.qty }));
  const total = values.reduce((s, x) => s + x.v, 0);
  const biggest = [...values].sort((a, b) => b.v - a.v)[0];
  const share = total > 0 && biggest ? biggest.v / total : 0;
  const heavy = biggest && share >= 0.5 && (rows.length >= 3 || share >= 0.6) ? biggest.ticker : null;

  const steps: string[] = [];
  if (sellNow.length) steps.push(`${join(sellNow)} đã thủng cắt lỗ. App chỉ cảnh báo, không bán hộ.`);
  if (sellLater.length) steps.push(`${join(sellLater)} đã thủng cắt lỗ, cổ phiếu chưa về (T+2). App không bán hộ.`);
  if (setStop.length) steps.push(`${join(setStop)} chưa có cắt lỗ. Đặt mức nếu muốn có trần. App không bán hộ.`);
  if (nearStop.length) steps.push(`${join(nearStop)} sát cắt lỗ. Cảnh báo, không mua thêm.`);
  if (takeNow.length) steps.push(`${join(takeNow)} đã tới chốt lời. App chỉ cảnh báo, không bán hộ. Lãi chưa bán có thể mất.`);
  if (takeLater.length) steps.push(`${join(takeLater)} đã tới chốt lời, cổ phiếu chưa về. App không bán hộ.`);
  if (takePart.length) steps.push(`${join(takePart)} gần chốt lời. App không bảo bán.`);
  if (setTarget.length) steps.push(`${join(setTarget)} chưa có mức chốt. Đặt mức nếu muốn được báo. App không bán hộ.`);
  if (trail.length) steps.push(`${join(trail)} đang lãi, chưa tới chốt lời. App không bảo bán.`);
  if (hold.length) steps.push(`${join(hold)} còn trong kế hoạch. App không bảo bán, không bảo mua thêm để gỡ.`);
  if (waitPrice.length) steps.push(`${join(waitPrice)} chưa có giá mới — chưa cảnh báo được.`);

  let headline: string;
  let tone: AdviceTone;
  if (sellNow.length) {
    headline = `Cảnh báo: ${short(sellNow)} đã thủng cắt lỗ`;
    tone = "loss";
  } else if (setStop.length) {
    headline = `Việc đầu tiên: đặt cắt lỗ cho ${short(setStop)}`;
    tone = "loss";
  } else if (sellLater.length) {
    headline = `Cảnh báo: ${short(sellLater)} đã thủng cắt lỗ, cổ phiếu chưa về`;
    tone = "loss";
  } else if (nearStop.length) {
    headline = `Sát cắt lỗ ${short(nearStop)} — đừng mua thêm`;
    tone = "loss";
  } else if (takeNow.length || takeLater.length) {
    const xs = [...takeNow, ...takeLater];
    headline = `Cảnh báo chốt lời ${short(xs)}`;
    tone = "gain";
  } else {
    headline = "Trong kế hoạch — app không bảo bán";
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
    "Cắt lỗ là trần lỗ bạn đã đặt. Thủng thì app cảnh báo, không bán hộ. Đừng chờ về giá mua rồi mới để ý.",
    "Không mua thêm mã đang lỗ để kéo giá vốn. Giá tiếp tục giảm thì lỗ to hơn, không phải được giá rẻ.",
    heavy ? `Đừng mua thêm ${heavy}.` : "Đừng dồn phần lớn tiền vào một mã.",
    sellNow.length || setStop.length || sellLater.length
      ? "Chưa xử lý các việc trên thì đừng mua mã mới."
      : "Mỗi lệnh mới cũng cần cắt lỗ trước khi mua. Chưa cần mở thêm thì đứng ngoài.",
  ].join(" ");

  const notes = [averageNote(tagged), lossNote(tagged), profitNote(tagged)];
  return { headline, why: why.join(" "), steps, protect, notes, tone };
}
