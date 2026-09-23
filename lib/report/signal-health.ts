import { prisma } from "@/lib/prisma";
import { getBool } from "@/lib/settings";
import { getQuote } from "@/lib/price";
import { sendTelegram } from "@/lib/telegram/notify";
import { latestSignalDate } from "@/lib/signals";
import { assessOpportunity } from "@/lib/analysis/opportunity";
import { quoteFresh, signalExpired } from "@/lib/quote-quality";

/** Chắn hỏng stop/target trước T+2 — chỉ báo web/mark, không tự bán. */
export async function runSignalHealth() {
  if (await getBool("killSwitch")) return 0;
  if (!(await getBool("scanEnabled"))) return 0;
  const signalDate = await latestSignalDate();
  if (!signalDate) return 0;
  const rows = await prisma.signal.findMany({
    where: { date: { gte: new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10) }, status: { in: ["new", "notified"] } },
    include: { symbol: true, strategy: { select: { name: true } } },
  });
  let expired = 0;
  for (const s of rows) {
    const q = await getQuote(s.symbol.ticker);
    if (!q.last || !Number.isFinite(q.last) || q.source !== "minute") continue;
    if (!quoteFresh(q, new Date(), signalDate)) continue;
    const assessment = assessOpportunity({ confirmed: true, price: q.last, stop: s.stop, target: s.target, buyZone: s.buyLow !== null && s.buyHigh !== null ? [s.buyLow, s.buyHigh] : null, fresh: true, expired: signalExpired(s.date, signalDate) });
    if (assessment.state === "invalid" && q.last <= s.stop) {
      const claimed = await prisma.signal.updateMany({ where: { id: s.id, status: { in: ["new", "notified"] } }, data: { status: "expired" } });
      if (claimed.count === 0) continue;
      expired++;
      await sendTelegram(
        `🛑 <b>Tín hiệu hết hiệu lực — ${s.symbol.ticker}</b> (${s.date} · ${s.strategy.name})\nĐã thủng cắt lỗ: giá hiện tại ${q.last.toFixed(2)} dưới ${s.stop.toFixed(2)}.\nKhông tự động bán; người dùng chủ động quản lý.\n<i>Ghi chú, không phải khuyến nghị.</i>`,
        undefined,
        { kind: "signal", userId: null, ticker: s.symbol.ticker },
      );
    }
  }
  return expired;
}
