import { prisma } from "../prisma";
import { getNum } from "../settings";
import { formatPositionsReport, positionsReport, type PositionLine } from "./positions";

const BUY_FEE = 0.0015;
const SELL_FEE_TAX = 0.0015 + 0.001;

export interface Portfolio {
  initial: number; // vốn ban đầu (Setting navVnd)
  cash: number; // tiền mặt còn lại
  marketValue: number; // giá trị CP đang giữ theo giá hiện tại (chưa trừ phí bán)
  nav: number; // tổng tài sản nếu bán hết hôm nay (đã trừ phí+thuế bán)
  realized: number; // lãi/lỗ đã chốt (net)
  unrealized: number; // lãi/lỗ tạm tính vị thế đang mở (net)
  totalPnl: number;
  totalPct: number; // so với vốn ban đầu
  dayPnl: number | null; // biến động giá hôm nay của CP đang giữ
  closedCount: number;
  wins: number;
  winRate: number | null; // %
  avgWin: number | null;
  avgLoss: number | null;
  best: { ticker: string; pnl: number } | null;
  worst: { ticker: string; pnl: number } | null;
}

type Open = Pick<PositionLine, "qty" | "entry" | "price" | "prevClose">;
type Closed = { ticker: string; pnl: number };

const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);

/** Pure: NAV = tiền mặt + CP giữ quy ra tiền (bán hết, trừ phí+thuế). Giá thiếu → tính theo giá vốn. */
export function computePortfolio(initial: number, open: Open[], closed: Closed[]): Portfolio {
  const realized = sum(closed.map((c) => c.pnl));
  const cost = sum(open.map((p) => p.entry * p.qty * 1000 * (1 + BUY_FEE)));
  const cash = initial + realized - cost;
  const marketValue = sum(open.map((p) => (p.price ?? p.entry) * p.qty * 1000));
  const nav = cash + marketValue * (1 - SELL_FEE_TAX);
  const unrealized = nav - cash - cost;
  const moves = open.filter((p) => p.price !== null && p.prevClose);
  const dayPnl = moves.length ? sum(moves.map((p) => (p.price! - p.prevClose!) * p.qty * 1000)) : null;

  const winsArr = closed.filter((c) => c.pnl > 0);
  const lossArr = closed.filter((c) => c.pnl <= 0);
  const sorted = [...closed].sort((a, b) => b.pnl - a.pnl);
  return {
    initial,
    cash,
    marketValue,
    nav,
    realized,
    unrealized,
    totalPnl: realized + unrealized,
    totalPct: initial ? ((realized + unrealized) / initial) * 100 : 0,
    dayPnl,
    closedCount: closed.length,
    wins: winsArr.length,
    winRate: closed.length ? (winsArr.length / closed.length) * 100 : null,
    avgWin: avg(winsArr.map((c) => c.pnl)),
    avgLoss: avg(lossArr.map((c) => c.pnl)),
    best: sorted[0] ?? null,
    worst: sorted.length ? sorted[sorted.length - 1] : null,
  };
}

/** Truyền `lines` nếu đã gọi positionsReport() để khỏi lấy giá 2 lần. */
export async function loadPortfolio(lines?: PositionLine[]): Promise<Portfolio> {
  const [initial, open, closed] = await Promise.all([
    getNum("navVnd"),
    lines ?? positionsReport(),
    prisma.trade.findMany({
      where: { status: "closed", pnl: { not: null } },
      select: { pnl: true, symbol: { select: { ticker: true } } },
    }),
  ]);
  return computePortfolio(
    initial,
    open,
    closed.map((t) => ({ ticker: t.symbol.ticker, pnl: t.pnl! })),
  );
}

const tr = (v: number) => `${v >= 0 ? "+" : ""}${(v / 1e6).toFixed(2)}tr`;

/** Dòng tóm tắt tài sản cho Telegram (HTML, không có text động từ user). */
export function formatPortfolio(p: Portfolio): string {
  return [
    `💼 <b>TÀI SẢN</b> ${(p.nav / 1e6).toFixed(2)}tr (${p.totalPct >= 0 ? "+" : ""}${p.totalPct.toFixed(2)}% so với vốn ${(p.initial / 1e6).toFixed(0)}tr)`,
    `  Tiền mặt ${(p.cash / 1e6).toFixed(2)}tr · CP ${(p.marketValue / 1e6).toFixed(2)}tr` +
      (p.dayPnl !== null ? ` · hôm nay ${tr(p.dayPnl)}` : ""),
    `  Đã chốt ${tr(p.realized)} · đang giữ ${tr(p.unrealized)}` +
      (p.winRate !== null ? ` · thắng ${p.wins}/${p.closedCount} (${p.winRate.toFixed(0)}%)` : ""),
  ].join("\n");
}

/** Tin vị thế + tóm tắt tài sản — dùng chung bot/cron/watcher. */
export async function positionsMessage(lines?: PositionLine[]): Promise<string> {
  const ls = lines ?? (await positionsReport());
  return `${formatPositionsReport(ls)}\n\n${formatPortfolio(await loadPortfolio(ls))}`;
}
