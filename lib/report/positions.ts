import { prisma } from "../prisma";
import { getLatestPrice } from "../price";

const BUY_FEE = 0.0015;
const SELL_FEE_TAX = 0.0015 + 0.001; // phí bán + thuế

export interface PositionLine {
  ticker: string;
  qty: number;
  entry: number;
  price: number | null;
  prevClose: number | null;
  pnlPct: number | null; // net sau phí+thuế
  pnlVnd: number | null;
  dayPct: number | null; // % so giá đóng cửa phiên trước
  stop: number | null;
  target: number | null;
  sessionsHeld: number; // phiên đã trôi qua kể từ mua (T+2 check)
}

export async function positionsReport(): Promise<PositionLine[]> {
  const trades = await prisma.trade.findMany({
    where: { status: "open" },
    include: { symbol: true },
    orderBy: { id: "asc" },
  });

  const lines: PositionLine[] = [];
  for (const t of trades) {
    const [price, prevBars, held] = await Promise.all([
      getLatestPrice(t.symbol.ticker),
      prisma.dailyBar.findMany({
        where: { symbolId: t.symbolId },
        orderBy: { date: "desc" },
        take: 2,
        select: { close: true, date: true },
      }),
      prisma.dailyBar.count({
        where: {
          symbolId: t.symbolId,
          date: {
            gt: t.openedAt.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }),
          },
        },
      }),
    ]);
    const prevClose = prevBars.length > 1 ? prevBars[1].close : (prevBars[0]?.close ?? null);

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

    lines.push({
      ticker: t.symbol.ticker,
      qty: t.qty,
      entry: t.entryPrice,
      price,
      prevClose,
      pnlPct,
      pnlVnd,
      dayPct,
      stop: t.stopPrice,
      target: t.targetPrice,
      sessionsHeld: held,
    });
  }
  return lines;
}

export function formatPositionsReport(lines: PositionLine[]): string {
  if (!lines.length) return "Không có vị thế đang mở.";
  const rows = lines.map((l) => {
    const sign = (l.pnlPct ?? 0) >= 0 ? "+" : "";
    const daySign = (l.dayPct ?? 0) >= 0 ? "+" : "";
    const t2 = l.sessionsHeld >= 2 ? "" : ` | ⏳T+${l.sessionsHeld}`;
    const stop = l.stop ? ` | SL ${l.stop}` : "";
    const tgt = l.target ? ` | TP ${l.target}` : "";
    return (
      `<b>${l.ticker}</b> ${l.qty}cp @ ${l.entry} → ${l.price ?? "?"} ` +
      `(${sign}${l.pnlPct?.toFixed(2) ?? "?"}%${l.pnlVnd != null ? `, ${sign}${(l.pnlVnd / 1e6).toFixed(1)}tr` : ""})` +
      ` | hôm nay ${daySign}${l.dayPct?.toFixed(2) ?? "?"}%${stop}${tgt}${t2}`
    );
  });
  return ["📊 <b>Vị thế đang giữ</b>", ...rows].join("\n");
}
