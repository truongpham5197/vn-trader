import { prisma } from "./prisma";
import { sendTelegram, esc } from "./telegram/notify";

export interface DetectedAction {
  factor: number; // fresh/stored — vd 0.9718 (cổ tức tiền ~2.8%); <0.9 nghi chia tách/thưởng CP
  exDate: string; // phiên đầu tiên sau chốt quyền (ngày mới trong fresh, scale mới)
  kind: "cash" | "split";
}

const MIN_OVERLAP = 3;
const MIN_DEVIATION = 0.005; // |1 - factor| > 0.5% mới coi là GDKHQ
const RATIO_TOLERANCE = 0.01; // từng ngày lệch median ≤1% (nhiễu làm tròn tick)
const SPLIT_FACTOR_MAX = 0.9; // factor < 0.9 → khả năng cao là chia tách/cổ tức CP

/**
 * Phát hiện GDKHQ bằng cách so sánh close đã lưu vs close DNSE vừa fetch
 * (DNSE điều chỉnh lùi toàn bộ lịch sử trước ex-date). Trả null nếu khớp
 * hoặc tỷ lệ không đồng nhất (không đủ bằng chứng).
 */
export function detectAdjustment(
  stored: { date: string; close: number }[],
  fresh: { date: string; close: number }[],
): DetectedAction | null {
  const freshClose = new Map(fresh.map((b) => [b.date, b.close]));
  const common = stored
    .filter((s) => s.close > 0 && freshClose.has(s.date))
    .map((s) => ({ date: s.date, ratio: (freshClose.get(s.date) as number) / s.close }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (common.length < MIN_OVERLAP) return null;

  const median = [...common].sort((a, b) => a.ratio - b.ratio)[Math.floor(common.length / 2)].ratio;
  if (Math.abs(1 - median) <= MIN_DEVIATION) return null;

  // Inlier = bar pre-ex (đã bị DNSE adjust lùi); outlier có thể là bar post-ex
  // đã sync trước đó (ratio≈1) — miễn phần lớn nhất quán thì vẫn nhận diện được.
  const inliers = common.filter((c) => Math.abs(c.ratio - median) <= RATIO_TOLERANCE);
  if (inliers.length < MIN_OVERLAP || inliers.length <= common.length - inliers.length) return null;

  const lastPreEx = inliers[inliers.length - 1].date;
  const allDates = new Set([...stored.map((s) => s.date), ...fresh.map((b) => b.date)]);
  const exDate = [...allDates].filter((d) => d > lastPreEx).sort()[0];
  if (!exDate) return null;

  return { factor: median, exDate, kind: median < SPLIT_FACTOR_MAX ? "split" : "cash" };
}

/**
 * Áp điều chỉnh sau GDKHQ: nhân factor vào bars lịch sử (<exDate) cho khớp
 * scale DNSE, và vào entry/stop/target của Trade mở + Signal new/notified.
 * Split-like (factor<0.9): chia qty/volume cho factor, làm tròn lot 100.
 * Position (live) KHÔNG đụng — TCBS tự trả avgPrice/qty đã adjust ở sync sau.
 */
export async function applyCorporateAction(
  symbolId: number,
  ticker: string,
  act: DetectedAction,
): Promise<{ barsAdjusted: number; tradesAdjusted: number; signalsAdjusted: number }> {
  const { factor, exDate, kind } = act;
  const split = kind === "split";

  // 1. Bars lịch sử: giá × factor. Cash → volume giữ nguyên (DNSE cũng vậy),
  //    value scale theo close. Split → volume ÷ factor, value gần như bất biến.
  const barsAdjusted = split
    ? await prisma.$executeRaw`
        UPDATE "DailyBar"
        SET open = open * ${factor}, high = high * ${factor}, low = low * ${factor},
            close = close * ${factor}, volume = ROUND(volume / ${factor})::int
        WHERE "symbolId" = ${symbolId} AND date < ${exDate}`
    : await prisma.$executeRaw`
        UPDATE "DailyBar"
        SET open = open * ${factor}, high = high * ${factor}, low = low * ${factor},
            close = close * ${factor}, value = value * ${factor}
        WHERE "symbolId" = ${symbolId} AND date < ${exDate}`;

  // 2. Trade mở + Signal chờ: giá × factor. Split → qty ÷ factor floor lot 100.
  const tradesAdjusted = split
    ? await prisma.$executeRaw`
        UPDATE "Trade" SET "entryPrice" = "entryPrice" * ${factor},
          "stopPrice" = "stopPrice" * ${factor}, "targetPrice" = "targetPrice" * ${factor},
          qty = GREATEST(FLOOR(qty / ${factor} / 100) * 100, 100)::int
        WHERE "symbolId" = ${symbolId} AND status = 'open'`
    : await prisma.$executeRaw`
        UPDATE "Trade" SET "entryPrice" = "entryPrice" * ${factor},
          "stopPrice" = "stopPrice" * ${factor}, "targetPrice" = "targetPrice" * ${factor}
        WHERE "symbolId" = ${symbolId} AND status = 'open'`;

  const signalsAdjusted = split
    ? await prisma.$executeRaw`
        UPDATE "Signal" SET entry = entry * ${factor}, stop = stop * ${factor},
          target = target * ${factor}, "buyLow" = "buyLow" * ${factor},
          "buyHigh" = "buyHigh" * ${factor},
          qty = GREATEST(FLOOR(qty / ${factor} / 100) * 100, 100)::int
        WHERE "symbolId" = ${symbolId} AND status IN ('new','notified')`
    : await prisma.$executeRaw`
        UPDATE "Signal" SET entry = entry * ${factor}, stop = stop * ${factor},
          target = target * ${factor}, "buyLow" = "buyLow" * ${factor},
          "buyHigh" = "buyHigh" * ${factor}
        WHERE "symbolId" = ${symbolId} AND status IN ('new','notified')`;

  await prisma.corporateAction.upsert({
    where: { symbolId_exDate: { symbolId, exDate } },
    update: {},
    create: { symbolId, exDate, factor, kind },
  });

  await sendTelegram(
    `📋 <b>${esc(ticker)}</b> GDKHQ ${exDate} — hệ số điều chỉnh ×${factor.toFixed(4)} (${
      split ? "chia tách/thưởng — qty ÷ hệ số, làm tròn lot 100" : "cổ tức tiền — qty giữ nguyên"
    }).\nĐã điều chỉnh giá vốn/stop/target vị thế mở + lịch sử bars. Kiểm tra lại nếu khớp thực tế khác.`,
  );

  return { barsAdjusted, tradesAdjusted, signalsAdjusted };
}
