import { px } from "../format";
import { netPnl } from "../fees";
import { levelState } from "./levels";

export type AdviceTone = "loss" | "gain" | "neutral";

export interface PositionAdvice {
  /** Một câu hiện luôn. */
  line: string;
  /** Vì sao — bấm xem thêm. */
  detail: string;
  tone: AdviceTone;
}

/** Nhãn trên từng mã. Filter phía dưới dùng đúng các chuỗi này. */
const LINE = {
  waitPrice: "Chưa có giá, bình tĩnh",
  setStop: "Ê, chưa có cắt lỗ",
  stopNow: "Ối, thủng cắt lỗ rồi",
  stopLater: "Thủng cắt lỗ, hàng chưa về",
  targetNow: "Tới chốt lời kìa",
  targetLater: "Tới chốt lời, hàng chưa về",
  nearStop: "Sát cắt lỗ, run tay",
  nearTarget: "Sắp chạm chốt rồi",
  setTarget: "Chưa có chốt lời kìa",
  green: "Đang xanh, chill đi",
  red: "Đỏ nhẹ, chưa tới mức",
  flat: "Vẫn trong vùng, thở đi",
} as const;

/** Lời khuyên vị thế đang giữ. Vui, hơi mỉa — là gợi ý, không phải lệnh, không hứa lãi. */
export function positionAdvice(p: {
  price: number | null;
  stop: number | null;
  target: number | null;
  pnlPct: number | null;
  sessionsHeld: number;
}): PositionAdvice {
  const locked = p.sessionsHeld < 2;
  const wait = locked ? ` Hàng chưa về (T+${p.sessionsHeld}), từ từ. App không bán hộ.` : "";
  if (p.price === null || !(p.price > 0)) {
    return { line: LINE.waitPrice, detail: "Giá còn ngủ. Chưa có gì để la, cũng chưa có lời khuyên mua hay bán.", tone: "neutral" };
  }
  if (!p.stop) {
    return {
      line: LINE.setStop,
      detail: "Lời khuyên: đặt một mức cắt lỗ cho đỡ run. Chưa có mức thì lỗ không có trần. App không bán hộ.",
      tone: "loss",
    };
  }
  const lv = levelState(p.price, p.stop, p.target);
  if (lv?.kind === "stop-broken") {
    return {
      line: locked ? LINE.stopLater : LINE.stopNow,
      detail: `${lv.detail} Lời khuyên: cân nhắc bán cho lỗ có trần. Không mua thêm để gỡ — càng mua càng xỉu.${wait}`,
      tone: "loss",
    };
  }
  if (lv?.kind === "target-hit") {
    return {
      line: locked ? LINE.targetLater : LINE.targetNow,
      detail: `${lv.detail} Lời khuyên: có thể chốt một phần, hoặc kéo cắt lỗ lên. App không bán hộ. Đừng mở tiệc sớm.${wait}`,
      tone: "gain",
    };
  }
  if (lv?.kind === "near-stop") {
    return {
      line: LINE.nearStop,
      detail: `${lv.detail} Lời khuyên: canh thôi. Muốn bớt run thì bán bớt, đừng mua thêm để kéo giá vốn.${wait}`,
      tone: "loss",
    };
  }
  if (lv?.kind === "near-target") {
    return {
      line: LINE.nearTarget,
      detail: `${lv.detail} Lời khuyên: có thể chốt bớt. Phần giữ thì kéo cắt lỗ lên. Không bắt buộc.${wait}`,
      tone: "gain",
    };
  }
  if (!p.target) {
    return {
      line: LINE.setTarget,
      detail: "Lời khuyên: đặt một mức chốt, kẻo không biết lúc nào là đủ. App không bán hộ.",
      tone: "neutral",
    };
  }
  const pnl = p.pnlPct;
  if (pnl !== null && pnl >= 3) {
    return {
      line: LINE.green,
      detail: `Đang lãi ${pnl.toFixed(1)}%, chưa tới chốt. Lời khuyên: chưa bán chỉ vì đã xanh. Muốn khóa thì tự nâng cắt lỗ lên trên giá vốn.`,
      tone: "gain",
    };
  }
  if (pnl !== null && pnl <= -3) {
    return {
      line: LINE.red,
      detail: `Đang lỗ ${pnl.toFixed(1)}% nhưng chưa chạm cắt lỗ. Lời khuyên: giữ đến mức đã đặt, hoặc bán bớt nếu muốn giảm rủi ro. Không mua thêm để gỡ.`,
      tone: "loss",
    };
  }
  return {
    line: LINE.flat,
    detail: "Giá còn giữa cắt lỗ và chốt lời. Lời khuyên: ngồi yên. Chưa có lý do bán sớm hay mua thêm.",
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
  verdict: string;
  why: string;
}

export interface BookAdvice {
  headline: string;
  why: string;
  steps: string[];
  protect: string;
  notes: HandlingNote[];
  tone: AdviceTone;
}

const LOT = 100;

/**
 * % giá cần tăng để về hòa vốn. Hệ thức, không phải dự báo:
 * lỗ một phần f của vốn lệnh thì cần lãi f/(1−f) trên phần còn lại.
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
  return `${worst.ticker} đang lỗ ${Math.abs(worst.pnlPct).toFixed(1)}% so với giá vốn (đã trừ phí). Muốn hòa thì giá phải tăng khoảng ${need.toFixed(1)}%. Số % cần để gỡ luôn lớn hơn số % đã lỗ — càng để sâu càng khó về.`;
}

function averageNote(rows: Tagged[]): HandlingNote {
  const broken = rows.filter((p) => p.line === LINE.stopNow || p.line === LINE.stopLater);
  const noStop = rows.filter((p) => p.line === LINE.setStop);
  const noPrice = rows.filter((p) => p.line === LINE.waitPrice);
  const losers = rows.filter(
    (p) => p.pnlPct !== null && p.pnlPct < -0.05 && p.stop !== null && p.price !== null && p.price > p.stop,
  );
  const near = rows.filter((p) => p.line === LINE.nearStop);

  if (!rows.length || noPrice.length === rows.length) {
    return {
      title: "Trung bình giá",
      verdict: "Chưa đủ giá để khuyên mua thêm. Bình tĩnh.",
      why: "Chưa có giá mới thì không biết lệnh còn trên cắt lỗ hay đã thủng. Lời khuyên: đừng mua thêm trong lúc mù.",
    };
  }
  if (broken.length || noStop.length) {
    const bits: string[] = [];
    if (broken.length) bits.push(`${join(broken.map((p) => p.ticker))} đã qua cắt lỗ`);
    if (noStop.length) bits.push(`${join(noStop.map((p) => p.ticker))} chưa có cắt lỗ`);
    const also = losers.filter((p) => !broken.includes(p) && !noStop.includes(p));
    return {
      title: "Trung bình giá",
      verdict: `Lời khuyên: không trung bình giá ${short([...broken, ...noStop].map((p) => p.ticker))}. Mua thêm lúc này chỉ cho lỗ to hơn, không phải sale.`,
      why: [
        `${bits.join(". ")}.`,
        also.length ? `${join(also.map((p) => p.ticker))} đang lỗ nhưng còn trên cắt lỗ — cũng chưa nên mua thêm.` : "",
        "Giá thấp hơn giá mua không có nghĩa là rẻ hơn: app không tính giá trị doanh nghiệp. Mua thêm chỉ tăng số tiền mất nếu giá tiếp tục giảm.",
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
      "Mua thêm mã đang lỗ chỉ không phá kế hoạch khi đủ cả bốn điều kiện: đã chia sẵn số lượng trước khi giá giảm, giá vẫn trên cắt lỗ, không hạ cắt lỗ, và tổng lỗ nếu chạm cắt lỗ không lớn hơn số tiền đã chấp nhận.",
      "App không kiểm tra được điều kiện đầu. Muốn mau hòa là cảm xúc, không phải kế hoạch đổi tốt hơn.",
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
    parts.push("Phần mua mới phải chờ đủ 2 phiên mới thoát được. App không đối chiếu số lỗ mới với % vốn bạn đã cài, nên không kết luận là còn chỗ để mua.");
    if (near.length) {
      parts.push(`${join(near.map((p) => p.ticker))} đang sát cắt lỗ. Thêm lúc này là thêm đúng chỗ kế hoạch sắp hết hiệu lực.`);
    }
    return {
      title: "Trung bình giá",
      verdict: `Lời khuyên: chưa đủ điều kiện trung bình giá ${short(losers.map((p) => p.ticker))}. Chưa nên mua thêm.`,
      why: parts.join(" "),
    };
  }
  return {
    title: "Trung bình giá",
    verdict: "Không có mã đang lỗ để trung bình giá. May.",
    why: "Trung bình giá là mua thêm đúng mã đang lỗ. Rổ này không có mã như vậy. Đang xanh mà mua thêm là chuyện khác — app không khuyên mua chỉ vì đã lãi.",
  };
}

function lossNote(rows: Tagged[]): HandlingNote {
  const sellNow = rows.filter((p) => p.line === LINE.stopNow);
  const sellLater = rows.filter((p) => p.line === LINE.stopLater);
  const noStop = rows.filter((p) => p.line === LINE.setStop);
  const prepare = rows.filter((p) => p.line === LINE.nearStop && (p.pnlPct === null || p.pnlPct < 0));
  const holdingLoss = rows.filter(
    (p) =>
      p.stop !== null &&
      p.pnlPct !== null &&
      p.pnlPct < -0.05 &&
      p.line !== LINE.stopNow &&
      p.line !== LINE.stopLater &&
      p.line !== LINE.setStop,
  );
  const recover = recoveryBit(rows);

  if (sellNow.length) {
    return {
      title: "Xử lý lỗ",
      verdict: `Lời khuyên: cân nhắc bán ${join(sellNow.map((p) => p.ticker))} — thủng cắt lỗ rồi. App không bán hộ.`,
      why: [
        "Cắt lỗ là số lỗ bạn đã chấp nhận trước khi mua. Giá đã qua mức đó, trần lỗ của kế hoạch không còn. Đây là gợi ý, không phải lệnh.",
        recover,
        "Không kéo cắt lỗ xuống để hết cảnh báo. Kéo xuống là chấp nhận lỗ lớn hơn sau khi giá đã đi ngược.",
        sellLater.length ? `${join(sellLater.map((p) => p.ticker))} cũng thủng, hàng chưa về. Lời khuyên giống vậy, khi cổ phiếu về.` : "",
        "Không mua mã khác để gỡ. Lệnh mới không xóa lỗ lệnh này.",
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  if (sellLater.length) {
    return {
      title: "Xử lý lỗ",
      verdict: `Lời khuyên: cân nhắc bán ${join(sellLater.map((p) => p.ticker))} khi hàng về. App không bán hộ.`,
      why: [
        "Đã qua cắt lỗ. Chưa đủ 2 phiên nên chưa thoát được — kế hoạch không đổi vì T+2.",
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
      verdict: `Lời khuyên: đặt cắt lỗ cho ${join(noStop.map((p) => p.ticker))} trước. App không bán hộ.`,
      why: "Chưa có mức thì không có trần lỗ. Đặt bằng số tiền tối đa bạn chịu mất. Thủng thì app sẽ nhắc cân nhắc bán, không tự bán.",
    };
  }
  if (prepare.length || holdingLoss.length) {
    const names = short([...new Set([...prepare, ...holdingLoss].map((p) => p.ticker))]);
    return {
      title: "Xử lý lỗ",
      verdict: `Lời khuyên: ${names} giữ đến cắt lỗ, hoặc bán bớt nếu muốn giảm rủi ro. Chưa nên mua thêm.`,
      why: [
        "Giá chưa chạm mức hủy, nên chưa phải lúc khuyên bán hết. Bán bớt là giảm rủi ro, vẫn là lựa chọn của bạn.",
        "Mua thêm hay kéo cắt lỗ xuống làm rủi ro lớn hơn. Đó không phải cách làm lỗ nhỏ đi.",
        prepare.length ? `${join(prepare.map((p) => p.ticker))} sát cắt lỗ. Lời khuyên: canh, đừng mua thêm.` : "",
        recover,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  return {
    title: "Xử lý lỗ",
    verdict: "Chưa có lỗ cần nhắc. Hưởng đi.",
    why: "Nếu sau này giá chạm cắt lỗ, lời khuyên sẽ là cân nhắc bán. Không phải chờ về giá mua rồi mới giật mình.",
  };
}

function profitNote(rows: Tagged[]): HandlingNote {
  const takeNow = rows.filter((p) => p.line === LINE.targetNow);
  const takeLater = rows.filter((p) => p.line === LINE.targetLater);
  const takePart = rows.filter((p) => p.line === LINE.nearTarget);
  const trail = rows.filter((p) => p.line === LINE.green);
  const noTarget = rows.filter((p) => p.line === LINE.setTarget);
  const green = rows.filter((p) => p.line === LINE.flat && p.pnlPct !== null && p.pnlPct > 0.05);
  const tightStop = rows.filter((p) => p.line === LINE.nearStop && p.pnlPct !== null && p.pnlPct > 0);
  const due = [...takeNow, ...takeLater];

  if (due.length) {
    const wait = takeLater.length && !takeNow.length;
    return {
      title: "Chốt lời",
      verdict: wait
        ? `Lời khuyên: ${short(due.map((p) => p.ticker))} tới chốt lời, cân nhắc chốt khi hàng về. App không bán hộ.`
        : `Lời khuyên: ${short(due.map((p) => p.ticker))} tới chốt lời. Có thể chốt một phần hoặc kéo cắt lỗ. App không bán hộ.`,
      why: [
        "Mức chốt là phần thưởng đã đặt lúc mua. Giá đã tới. App chỉ gợi ý, không đặt lệnh bán.",
        "Không nâng mức chốt lên chỉ vì giá đã chạm. Phần lên thêm không còn trong kế hoạch.",
        takePart.length ? `${join(takePart.map((p) => p.ticker))} sắp chạm chốt. Lời khuyên: có thể chốt bớt.` : "",
        takeLater.length && takeNow.length ? `${join(takeLater.map((p) => p.ticker))} cũng tới chốt, hàng chưa về.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  if (takePart.length) {
    return {
      title: "Chốt lời",
      verdict: `Lời khuyên: ${short(takePart.map((p) => p.ticker))} sắp chạm chốt. Có thể chốt bớt, không bắt buộc.`,
      why: "Gần mức đã đặt, chưa chạm. Chốt hết ngay là bán trước kế hoạch. Chốt một phần thì khóa một khoản đã có. Lãi trên giấy vẫn có thể mất.",
    };
  }
  if (trail.length || green.length || tightStop.length) {
    const names = short([...trail, ...green, ...tightStop].map((p) => p.ticker));
    return {
      title: "Chốt lời",
      verdict: tightStop.length && !trail.length && !green.length
        ? `Lời khuyên: ${join(tightStop.map((p) => p.ticker))} đang xanh nhưng cắt lỗ sát giá. Canh thôi, app không bán hộ.`
        : `Lời khuyên: ${names} đang xanh, chưa tới chốt. Chưa bán chỉ vì đã xanh.`,
      why: [
        "Bán chỉ vì đã xanh làm lãi trung bình nhỏ đi, trong khi lệnh lỗ vẫn bị nhắc ở cắt lỗ. Xanh một chút chưa phải tiệc.",
        trail.length ? `${join(trail.map((p) => p.ticker))} có thể tự nâng cắt lỗ lên trên giá vốn nếu muốn khóa. App không bán hộ.` : "",
        tightStop.length ? `${join(tightStop.map((p) => p.ticker))}: cắt lỗ sát giá. Chạm thì lời khuyên sẽ là cân nhắc bán.` : "",
        noTarget.length ? `Đặt chốt lời cho ${join(noTarget.map((p) => p.ticker))} nếu muốn có mốc.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  if (noTarget.length) {
    return {
      title: "Chốt lời",
      verdict: `Lời khuyên: đặt chốt lời cho ${short(noTarget.map((p) => p.ticker))} nếu muốn biết lúc nào là đủ.`,
      why: "Chưa có mức chốt thì không biết khi nào bán. App không bán hộ. Đặt mức cùng lúc với cắt lỗ nếu muốn được nhắc.",
    };
  }
  return {
    title: "Chốt lời",
    verdict: "Chưa có lãi để khuyên chốt. Chưa tới giờ ăn mừng.",
    why: "App nhắc khi giá tới mức chốt đã đặt. Chưa tới thì lời khuyên là chưa bán. Lãi trên giấy không phải tiền túi.",
  };
}

const join = (xs: string[]) => xs.join(", ");
const short = (xs: string[]) => (xs.length <= 4 ? join(xs) : `${xs.slice(0, 3).join(", ")} và ${xs.length - 3} mã nữa`);

/** Tâm sự cả rổ. Vui cho đỡ căng — lời khuyên theo kế hoạch đã đặt, không phải lệnh. */
export function bookAdvice(rows: BookPosition[]): BookAdvice | null {
  if (!rows.length) return null;
  const tagged = rows.map((p) => ({ ...p, line: positionAdvice(p).line }));
  const of = (line: string) => tagged.filter((p) => p.line === line).map((p) => p.ticker);
  const sellNow = of(LINE.stopNow);
  const sellLater = of(LINE.stopLater);
  const setStop = of(LINE.setStop);
  const nearStop = of(LINE.nearStop);
  const takeNow = of(LINE.targetNow);
  const takeLater = of(LINE.targetLater);
  const takePart = of(LINE.nearTarget);
  const setTarget = of(LINE.setTarget);
  const trail = of(LINE.green);
  const hold = [...of(LINE.flat), ...of(LINE.red)];
  const waitPrice = of(LINE.waitPrice);

  const values = tagged.map((p) => ({ ticker: p.ticker, v: (p.price ?? p.entry) * p.qty }));
  const total = values.reduce((s, x) => s + x.v, 0);
  const biggest = [...values].sort((a, b) => b.v - a.v)[0];
  const share = total > 0 && biggest ? biggest.v / total : 0;
  const heavy = biggest && share >= 0.5 && (rows.length >= 3 || share >= 0.6) ? biggest.ticker : null;

  const steps: string[] = [];
  if (sellNow.length) steps.push(`Lời khuyên: cân nhắc bán ${join(sellNow)}. Thủng cắt lỗ rồi. App không bán hộ.`);
  if (sellLater.length) steps.push(`Lời khuyên: cân nhắc bán ${join(sellLater)} khi hàng về (T+2). App không bán hộ.`);
  if (setStop.length) steps.push(`Lời khuyên: đặt cắt lỗ cho ${join(setStop)} cho đỡ run. App không bán hộ.`);
  if (nearStop.length) steps.push(`${join(nearStop)} sát cắt lỗ. Lời khuyên: canh, có thể bán bớt, đừng mua thêm.`);
  if (takeNow.length) steps.push(`Lời khuyên: ${join(takeNow)} tới chốt lời. Có thể chốt một phần hoặc kéo cắt lỗ. App không bán hộ.`);
  if (takeLater.length) steps.push(`Lời khuyên: ${join(takeLater)} tới chốt lời, cân nhắc chốt khi hàng về.`);
  if (takePart.length) steps.push(`Lời khuyên: ${join(takePart)} sắp chạm chốt. Có thể chốt bớt, không bắt buộc.`);
  if (setTarget.length) steps.push(`Lời khuyên: đặt chốt lời cho ${join(setTarget)} nếu muốn có mốc.`);
  if (trail.length) steps.push(`${join(trail)} đang xanh, chưa tới chốt. Lời khuyên: chưa bán chỉ vì đã xanh.`);
  if (hold.length) steps.push(`${join(hold)} còn trong vùng. Lời khuyên: ngồi yên, đừng mua thêm để gỡ.`);
  if (waitPrice.length) steps.push(`${join(waitPrice)} chưa có giá mới — chưa có lời khuyên.`);

  let headline: string;
  let tone: AdviceTone;
  if (sellNow.length) {
    headline = `Ối ${short(sellNow)}: thủng cắt lỗ. Lời khuyên là cân nhắc bán`;
    tone = "loss";
  } else if (setStop.length) {
    headline = `Ê, đặt cắt lỗ cho ${short(setStop)} trước đã`;
    tone = "loss";
  } else if (sellLater.length) {
    headline = `Ối ${short(sellLater)}: thủng cắt lỗ, hàng chưa về`;
    tone = "loss";
  } else if (nearStop.length) {
    headline = `${short(nearStop)} sát cắt lỗ — lời khuyên: đừng mua thêm`;
    tone = "loss";
  } else if (takeNow.length || takeLater.length) {
    const xs = [...takeNow, ...takeLater];
    headline = `${short(xs)} tới chốt lời kìa. Lời khuyên: có thể chốt`;
    tone = "gain";
  } else {
    headline = "Trong kế hoạch mà, thở đi — chưa khuyên bán";
    tone = "neutral";
  }

  const why: string[] = [];
  if (sellNow.length || sellLater.length) {
    why.push(`${join([...sellNow, ...sellLater])} đã xuống dưới mức cắt lỗ bạn đặt. Mức đó là số lỗ bạn chấp nhận từ trước. Giữ mà không để ý là đang chơi ngoài kế hoạch.`);
  }
  if (setStop.length) {
    why.push(`${join(setStop)} chưa có mức thoát. Đặt cắt lỗ trước thì lỗ có trần.`);
  }
  if (nearStop.length) {
    why.push(`${join(nearStop)} sát cắt lỗ. Mua thêm lúc này chỉ kéo giá vốn xuống, không cứu được lệnh nếu giá tiếp tục giảm.`);
  }
  if (takeNow.length || takeLater.length || takePart.length) {
    why.push(`${join([...takeNow, ...takeLater, ...takePart])} đã tới hoặc gần mức chốt. Lãi trên giấy vẫn mất nếu giá quay lại.`);
  }
  if (heavy) why.push(`${heavy} chiếm phần lớn số đang giữ. Mã này hắt hơi là cả rổ sổ mũi.`);
  if (!why.length) why.push(`${rows.length} mã còn trong vùng kế hoạch. Chưa có gì để la, cũng chưa có lý do mở thêm.`);

  const protect = [
    "Cắt lỗ là trần lỗ bạn đã đặt. Thủng thì lời khuyên là cân nhắc bán, app không bán hộ. Đừng chờ về giá mua rồi mới giật mình.",
    "Không mua thêm mã đang lỗ để kéo giá vốn. Giá tiếp tục giảm thì lỗ to hơn, không phải được giá rẻ.",
    heavy ? `Đừng mua thêm ${heavy}.` : "Đừng dồn phần lớn tiền vào một mã.",
    sellNow.length || setStop.length || sellLater.length
      ? "Mấy việc trên chưa để ý thì đừng mua mã mới."
      : "Mỗi lệnh mới cũng cần cắt lỗ trước khi mua. Chưa cần mở thêm thì đứng ngoài, cũng cool.",
  ].join(" ");

  return { headline, why: why.join(" "), steps, protect, notes: [averageNote(tagged), lossNote(tagged), profitNote(tagged)], tone };
}
