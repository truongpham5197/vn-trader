import { prisma } from "../prisma";
import { ownerId } from "../user";
import { getQuote } from "../price";
import { esc } from "../telegram/notify";
import { vnNow } from "../vn-time";
import { latestSignalDate } from "../signals";
import { quoteFresh, signalExpired } from "../quote-quality";
import { assessOpportunity } from "../analysis/opportunity";
import { getAdviceParams } from "../advice-learn";

export interface Pick {
  ticker: string;
  sector: string | null;
  label: string; // tên strategy (signal) hoặc setup (watchlist VN30)
  watch: boolean; // true = chưa thành Signal, chỉ là setup đang theo dõi
  entry: number;
  stop: number;
  target: number;
  qty: number | null;
  buyZone: [number, number] | null;
  horizon: string | null; // "5–15 phiên" — kỳ vọng nắm giữ tới target
  reason: string;
  last: number | null; // giá live (nến 1m DNSE, trễ ~1 phút)
  ref: number | null; // tham chiếu = close phiên trước
  netRR?: number;
}

/** "Kỳ vọng 3–10 phiên; ..." → "3–10 phiên" (trích từ plan của strategy). */
export function extractHorizon(plan: string | null): string | null {
  const m = plan?.match(/Kỳ vọng\s+([^;.]+)/i);
  return m ? m[1].trim() : null;
}

/** Trạng thái giá live so với vùng mua: 0 = trong vùng, dương = lệch %. */
export function zoneDistancePct(last: number, zone: [number, number]): number {
  if (last >= zone[0] && last <= zone[1]) return 0;
  return (Math.min(Math.abs(last - zone[0]), Math.abs(last - zone[1])) / last) * 100;
}

/**
 * Chỉ signal đã xác nhận, còn hiệu lực và giá đủ mới trong vùng.
 * Xếp R:R ròng sau phí; không bù setup theo dõi để đủ số lượng.
 */
export async function collectTopPicks(
  limit = 5,
): Promise<{ picks: Pick[]; signalDate: string | null }> {
  const [signalDate, ap] = await Promise.all([latestSignalDate(), getAdviceParams()]);
  if (!signalDate || signalExpired(signalDate, signalDate)) return { picks: [], signalDate };

  const held = new Set(
    (
      await prisma.trade.findMany({
        where: { status: "open", userId: await ownerId() },
        include: { symbol: { select: { ticker: true } } },
      })
    ).map((t) => t.symbol.ticker),
  );

  const raw = signalDate
    ? await prisma.signal.findMany({
        where: { date: signalDate, status: { in: ["new", "notified"] } },
        include: { symbol: true, strategy: true },
        orderBy: { id: "desc" },
      })
    : [];
  // Dedupe per ticker — giữ bản rr cao nhất
  const byTicker = new Map<string, (typeof raw)[number]>();
  for (const s of raw) {
    if (held.has(s.symbol.ticker)) continue;
    const cur = byTicker.get(s.symbol.ticker);
    if (!cur || s.rr > cur.rr) byTicker.set(s.symbol.ticker, s);
  }

  const cands = [...byTicker.values()];
  const quotes = await Promise.all(cands.map((s) => getQuote(s.symbol.ticker)));
  const picks: Pick[] = [];
  for (const [i, s] of cands.entries()) {
    const q = quotes[i];
    const buyZone: [number, number] | null = s.buyLow !== null && s.buyHigh !== null ? [s.buyLow, s.buyHigh] : null;
    const assessment = assessOpportunity({
      confirmed: true, price: q.last, stop: s.stop, target: s.target, buyZone,
      fresh: quoteFresh(q, new Date(), signalDate), expired: signalExpired(s.date, signalDate),
      minNetRR: ap.minNetRR,
    });
    if (!assessment.actionable) continue;
    picks.push({
      ticker: s.symbol.ticker,
      sector: s.symbol.sector,
      label: s.strategy.name,
      watch: false,
      entry: s.entry,
      stop: s.stop,
      target: s.target,
      qty: null, // số lượng chỉ tính trong kế hoạch cá nhân, không dùng qty chung
      buyZone,
      netRR: assessment.netRR ?? 0,
      horizon: extractHorizon(s.plan),
      reason: s.reason ?? "",
      last: q.last,
      ref: q.ref,
    });
  }
  picks.sort((a, b) => (b.netRR ?? 0) - (a.netRR ?? 0) || a.ticker.localeCompare(b.ticker));
  const top = picks.slice(0, limit);


  return { picks: top, signalDate };
}

function zoneTag(p: Pick): string {
  if (p.last === null || !p.buyZone) return "";
  if (p.last >= p.buyZone[0] && p.last <= p.buyZone[1]) return "✅ trong vùng mua";
  const d = zoneDistancePct(p.last, p.buyZone).toFixed(1);
  return p.last > p.buyZone[1] ? `🔺 trên vùng +${d}%` : `🔻 dưới vùng −${d}%`;
}

export function formatTopPicks(picks: Pick[], signalDate: string | null): string {
  if (!picks.length) return "Không có tín hiệu đã xác nhận còn phù hợp theo dữ liệu hiện có. Đứng ngoài cũng là một lựa chọn; không bổ sung mã chỉ để đủ top.";
  const now = vnNow();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const blocks = picks.map((p, i) => {
    const chg = p.last !== null && p.ref ? (p.last / p.ref - 1) * 100 : null;
    const up = ((p.target - p.entry) / p.entry) * 100;
    const dn = ((p.entry - p.stop) / p.entry) * 100;
    const zone = p.buyZone
      ? `vùng mua <b>${p.buyZone[0].toFixed(2)}–${p.buyZone[1].toFixed(2)}</b>`
      : `vào <b>${p.entry.toFixed(2)}</b>`;
    return [
      `<b>${i + 1}. ${p.ticker}</b>${p.sector ? ` · ${esc(p.sector)}` : ""} · <i>${esc(p.label)}${p.watch ? " · watchlist" : ""}</i>`,
      `   💵 <b>${p.last !== null ? p.last.toFixed(2) : "?"}</b>` +
        (chg !== null && p.ref
          ? ` (${chg >= 0 ? "+" : ""}${chg.toFixed(2)}% vs TC ${p.ref.toFixed(2)})`
          : "") +
        (zoneTag(p) ? ` — ${zoneTag(p)}` : ""),
      `   🛒 ${zone} · giá vào ${p.entry.toFixed(2)}${p.qty ? ` · ${p.qty.toLocaleString("en-US")}cp` : ""}`,
      `   🎯 TP <b>${p.target.toFixed(2)}</b> (+${up.toFixed(1)}%) · SL ${p.stop.toFixed(2)} (−${dn.toFixed(1)}%)` +
        (p.horizon ? ` · ⏱ ~${esc(p.horizon)}` : ""),
      `   💡 <i>${esc(p.reason)}</i>`,
      ...(p.netRR !== undefined ? [`   R:R sau phí tại giá hiện tại: ${p.netRR.toFixed(2)} — không phải xác suất thắng`] : []),
    ].join("\n");
  });
  return [
    `🔥 <b>TOP ${picks.length} MÃ TIỀM NĂNG</b> — ${hhmm}` +
      (signalDate ? ` · <i>tín hiệu ${signalDate}</i>` : ""),
    ...blocks,
    "<i>Mục tiêu theo mô hình, không phải dự báo. Kiểm tra kế hoạch vốn riêng; cắt lỗ không bảo đảm khớp đúng giá. Chưa chứng minh có lãi.</i>",
  ].join("\n\n");
}

/** Trong phiên VN: T2–T6, 9:00–15:00. Nghỉ trưa vẫn tính — giá đóng băng thì dedupe lo. */
export function inSession(now: Date): boolean {
  const dow = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  return dow >= 1 && dow <= 5 && mins >= 9 * 60 && mins < 15 * 60;
}
