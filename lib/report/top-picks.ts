import { prisma } from "../prisma";
import { getQuote } from "../price";
import { getBool, getSetting, setSetting } from "../settings";
import { esc, sendTelegram } from "../telegram/notify";
import { vnNow } from "../vn-time";

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
}

export interface TopPicksResult {
  sent: boolean;
  picks: number;
  skippedReason?: string;
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

// Điểm xếp hạng: trong vùng mua = 0; chạy trên vùng bị phạt +2 (đuổi giá rủi ro hơn
// mua rẻ dưới vùng). Không có zone → so khoảng cách tới entry.
function actionability(p: Pick): number {
  if (p.last === null) return 999;
  if (!p.buyZone) return (Math.abs(p.last - p.entry) / p.entry) * 100;
  const d = zoneDistancePct(p.last, p.buyZone);
  return p.last > p.buyZone[1] ? d + 2 : d;
}

/**
 * Top N mã tiềm năng: signal mới nhất (new/notified, chưa nắm giữ, giá chưa
 * hỏng setup) xếp theo độ "vào được ngay"; thiếu thì bù bằng watchlist VN30
 * (setup có đủ vùng mua/SL/TP).
 */
export async function collectTopPicks(
  limit = 5,
): Promise<{ picks: Pick[]; signalDate: string | null }> {
  const lastSig = await prisma.signal.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const signalDate = lastSig?.date ?? null;

  const held = new Set(
    (
      await prisma.trade.findMany({
        where: { status: "open" },
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

  const cands = [...byTicker.values()].slice(0, 10);
  const quotes = await Promise.all(cands.map((s) => getQuote(s.symbol.ticker)));
  const picks: Pick[] = [];
  for (const [i, s] of cands.entries()) {
    const q = quotes[i];
    // Setup đã hỏng intraday: thủng stop hoặc đã chạm target → bỏ
    if (q.last !== null && (q.last < s.stop || q.last >= s.target)) continue;
    picks.push({
      ticker: s.symbol.ticker,
      sector: s.symbol.sector,
      label: s.strategy.name,
      watch: false,
      entry: s.entry,
      stop: s.stop,
      target: s.target,
      qty: s.qty,
      buyZone: s.buyLow !== null && s.buyHigh !== null ? [s.buyLow, s.buyHigh] : null,
      horizon: extractHorizon(s.plan),
      reason: s.reason ?? "",
      last: q.last,
      ref: q.ref,
    });
  }
  picks.sort((a, b) => actionability(a) - actionability(b) || b.entry - a.entry);
  const top = picks.slice(0, limit);

  // Bù slot trống bằng watchlist VN30 (setup chưa thành signal)
  if (top.length < limit) {
    const { vn30Snapshot } = await import("../analysis/vn30");
    const chosen = new Set(top.map((p) => p.ticker));
    const rows = (await vn30Snapshot()).filter(
      (r) => r.buyZone && r.stop && r.target && !held.has(r.ticker) && !chosen.has(r.ticker),
    );
    for (const r of rows) {
      if (top.length >= limit) break;
      const q = await getQuote(r.ticker);
      if (q.last !== null && (q.last < (r.stop ?? 0) || q.last >= (r.target ?? Infinity))) continue;
      top.push({
        ticker: r.ticker,
        sector: r.sector,
        label: r.setup,
        watch: true,
        entry: r.close,
        stop: r.stop!,
        target: r.target!,
        qty: null,
        buyZone: r.buyZone ?? null,
        horizon: r.setup.includes("breakout")
          ? "5–15 phiên"
          : r.setup.includes("pullback")
            ? "3–10 phiên"
            : "1–5 phiên",
        reason: r.note,
        last: q.last,
        ref: q.ref,
      });
    }
  }

  return { picks: top, signalDate };
}

function zoneTag(p: Pick): string {
  if (p.last === null || !p.buyZone) return "";
  if (p.last >= p.buyZone[0] && p.last <= p.buyZone[1]) return "✅ trong vùng mua";
  const d = zoneDistancePct(p.last, p.buyZone).toFixed(1);
  return p.last > p.buyZone[1] ? `🔺 trên vùng +${d}%` : `🔻 dưới vùng −${d}%`;
}

export function formatTopPicks(picks: Pick[], signalDate: string | null): string {
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
    ].join("\n");
  });
  return [
    `🔥 <b>TOP ${picks.length} MÃ TIỀM NĂNG</b> — ${hhmm}` +
      (signalDate ? ` · <i>tín hiệu ${signalDate}</i>` : ""),
    ...blocks,
  ].join("\n\n");
}

const RESEND_AFTER_MS = 30 * 60e3;

/** Trong phiên VN: T2–T6, 9:00–15:00. Nghỉ trưa vẫn tính — giá đóng băng thì dedupe lo. */
export function inSession(now: Date): boolean {
  const dow = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  return dow >= 1 && dow <= 5 && mins >= 9 * 60 && mins < 15 * 60;
}

/**
 * Digest top-5 gửi Telegram mỗi 5 phút trong phiên. Dedupe: nội dung (mã + giá)
 * y hệt lần trước và chưa quá 30 phút → bỏ qua (nghỉ trưa/hết phiên giá đứng).
 */
export async function runTopPicksDigest(opts?: {
  limit?: number;
  force?: boolean;
}): Promise<TopPicksResult> {
  if (await getBool("killSwitch")) return { sent: false, picks: 0, skippedReason: "kill-switch" };
  if (!(await getBool("scanEnabled"))) return { sent: false, picks: 0, skippedReason: "paused" };
  if (!opts?.force && !inSession(vnNow()))
    return { sent: false, picks: 0, skippedReason: "out-of-session" };

  const { picks, signalDate } = await collectTopPicks(opts?.limit ?? 5);
  if (!picks.length) return { sent: false, picks: 0, skippedReason: "no-picks" };

  const key = picks.map((p) => `${p.ticker}:${p.last?.toFixed(2) ?? "?"}`).join(",");
  const prev = JSON.parse((await getSetting("topPicksState")) || "{}") as {
    at?: number;
    key?: string;
  };
  if (prev.key === key && Date.now() - (prev.at ?? 0) < RESEND_AFTER_MS)
    return { sent: false, picks: picks.length, skippedReason: "unchanged" };

  const ok = await sendTelegram(formatTopPicks(picks, signalDate));
  if (ok) await setSetting("topPicksState", JSON.stringify({ at: Date.now(), key }));
  return { sent: ok, picks: picks.length };
}
