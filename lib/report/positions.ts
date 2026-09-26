import { prisma } from "../prisma";
import { ownerId } from "../user";
import { getQuote } from "../price";
import { px } from "../format";
import { BUY_FEE, SELL_FEE_TAX } from "../fees";
import { levelState } from "../risk/levels";
import { voicedPositionAdvice } from "../risk/advice";
import { ADVICE_DEFAULTS, type AdviceParams } from "../advice-params";
import { esc } from "../telegram/notify";
import type { AdviceStyle } from "../persona-style";

export interface PositionLine {
  id: number; // Trade.id
  ticker: string;
  note: string | null;
  qty: number;
  entry: number;
  price: number | null;
  prevClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  pnlPct: number | null; // net sau phí+thuế
  pnlVnd: number | null;
  dayPct: number | null; // % so giá tham chiếu (close phiên trước)
  stop: number | null;
  target: number | null;
  sessionsHeld: number; // phiên đã trôi qua kể từ mua (T+2 check)
}

/** Vị thế mở của 1 user (mặc định owner — Telegram/cron). */
export async function positionsReport(userId?: number): Promise<PositionLine[]> {
  const trades = await prisma.trade.findMany({
    where: { status: "open", userId: userId ?? (await ownerId()) },
    include: { symbol: true },
    orderBy: { id: "asc" },
  });

  // Song song — mỗi mã 1 request giá, tuần tự thì N vị thế = N× độ trễ DNSE
  return Promise.all(trades.map(async (t): Promise<PositionLine> => {
    const [quote, held] = await Promise.all([
      getQuote(t.symbol.ticker),
      prisma.dailyBar.count({
        where: {
          symbolId: t.symbolId,
          date: {
            gt: t.openedAt.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }),
          },
        },
      }),
    ]);
    const price = quote.last;
    const prevClose = quote.ref;

    let pnlPct: number | null = null;
    let pnlVnd: number | null = null;
    let dayPct: number | null = null;
    if (price !== null) {
      const netSell = price * (1 - SELL_FEE_TAX);
      const netCost = t.entryPrice * (1 + BUY_FEE);
      pnlPct = (netSell / netCost - 1) * 100;
      pnlVnd = (netSell - netCost) * t.qty * 1000;
      if (prevClose) dayPct = (price / prevClose - 1) * 100;
    }

    return {
      id: t.id,
      ticker: t.symbol.ticker,
      note: t.note,
      qty: t.qty,
      entry: t.entryPrice,
      price,
      prevClose,
      open: quote.open,
      high: quote.high,
      low: quote.low,
      pnlPct,
      pnlVnd,
      dayPct,
      stop: t.stopPrice,
      target: t.targetPrice,
      sessionsHeld: held,
    };
  }));
}

const LEVEL_ICON = { "stop-broken": "🛑", "near-stop": "⚠️", "target-hit": "🎯", "near-target": "🎯" } as const;

/** Dòng trạng thái so với cắt lỗ/chốt lời — "ĐÃ THỦNG" khi giá ≤ cắt lỗ, "sát" chỉ khi còn trên ≤nearPct%. */
function level(l: PositionLine, st: AdviceStyle | undefined, ap: AdviceParams): string {
  const s = levelState(l.price, l.stop, l.target, ap.nearPct);
  if (!s) return "";
  const head = s.kind === "stop-broken" || s.kind === "target-hit" ? `<b>${s.label.toUpperCase()}</b>` : s.label;
  const t2 = s.kind === "stop-broken" && l.sessionsHeld < 2 ? " (Chưa đủ T+2 — CP về tài khoản mới bán được.)" : "";
  return `\n  ${LEVEL_ICON[s.kind]} ${head}: ${esc(st ? st.text(s.detail) : s.detail)}${t2}`;
}

/** `st` = giọng user → mỗi mã thêm 1 dòng lời khuyên theo văn phong đó. `ap` = tham số nhận xét (tự học). */
export function formatPositionsReport(lines: PositionLine[], st?: AdviceStyle, ap: AdviceParams = ADVICE_DEFAULTS): string {
  if (!lines.length) return "📊 Không có vị thế đang mở.";
  const rows = lines.map((l) => {
    const pnlIcon = (l.pnlPct ?? 0) >= 0 ? "🟢" : "🔴";
    const dayIcon = (l.dayPct ?? 0) >= 0 ? "🟢" : "🔴";
    const s = (v: number | null) => (v == null ? "" : v >= 0 ? "+" : "");
    const t2 = l.sessionsHeld >= 2 ? "" : ` · ⏳T+${l.sessionsHeld}`;
    const stop = l.stop ? `SL ${px(l.stop)}` : "SL —";
    const tgt = l.target ? `TP ${px(l.target)}` : "TP —";
    const ohlc =
      l.open !== null
        ? `\n  📈 O ${l.open.toFixed(2)} · H ${l.high?.toFixed(2)} · L ${l.low?.toFixed(2)} · TC ${l.prevClose?.toFixed(2) ?? "?"}`
        : "";
    return (
      `<b>${l.ticker}</b> · ${l.qty.toLocaleString("en-US")}cp @ ${px(l.entry)}` +
      `\n  💵 Giá <b>${px(l.price, "?")}</b> · hôm nay ${dayIcon} ${s(l.dayPct)}${l.dayPct?.toFixed(2) ?? "?"}%` +
      ohlc +
      `\n  ${pnlIcon} P&L ${s(l.pnlPct)}${l.pnlPct?.toFixed(2) ?? "?"}%` +
      `${l.pnlVnd != null ? ` (${s(l.pnlVnd)}${(l.pnlVnd / 1e6).toFixed(1)}tr)` : ""}` +
      ` · ${stop} · ${tgt}${t2}` +
      level(l, st, ap) +
      (st ? `\n  💬 ${esc(voicedPositionAdvice(l, st, ap).line)}` : "")
    );
  });
  return [`📊 <b>VỊ THẾ ĐANG GIỮ</b> (${lines.length})`, ...rows].join("\n\n");
}
