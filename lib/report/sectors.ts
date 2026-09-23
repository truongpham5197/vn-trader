import { prisma } from "../prisma";
import { ownerId } from "../user";
import { vn30Snapshot } from "../analysis/vn30";
import { getWatchlist } from "../trades";

export interface CorpActionInfo {
  exDate: string; // phiên GDKHQ
  kind: string; // cash | split
  factor: number; // hệ số điều chỉnh
  before: number | null; // close raw phiên cuối hưởng quyền (DB lưu đã adjust → /factor)
  after: number | null; // close đã điều chỉnh = tham chiếu scale mới
}

export interface SectorRow {
  ticker: string;
  sector: string;
  companyName: string | null;
  held: boolean; // đang có vị thế mở
  label: string | null; // strategy name / VN30 setup / "vị thế"
  buyLow: number | null;
  buyHigh: number | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  reason: string | null; // lý do ngắn (signal.reason / vn30 note / vị thế)
  plan: string | null; // thông tin thêm (signal.plan)
  ref: number | null; // tham chiếu = close phiên trước trong DB
  corp: CorpActionInfo | null; // sự kiện GDKHQ gần nhất
}

/**
 * Bảng nhóm ngành: mã đang theo dõi (vị thế mở + signal ngày mới nhất
 * new/notified + setup VN30 + danh sách theo dõi) gom theo sector ICB, kèm GDKHQ gần nhất.
 * Giá live điền phía client qua /api/quotes.
 */
export async function buildSectorBoard(userId?: number): Promise<SectorRow[]> {
  userId ??= await ownerId();
  const [trades, lastSig, vn30, watchlist] = await Promise.all([
    prisma.trade.findMany({ where: { status: "open", userId }, include: { symbol: true } }),
    prisma.signal.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    vn30Snapshot(),
    getWatchlist(userId),
  ]);

  const signals = lastSig
    ? await prisma.signal.findMany({
        where: { date: lastSig.date, status: { in: ["new", "notified"] } },
        include: { symbol: true, strategy: true },
      })
    : [];

  const map = new Map<string, SectorRow>();
  const put = (
    ticker: string,
    patch: Omit<Partial<SectorRow>, "sector"> & { sector?: string | null },
  ) => {
    const { sector, ...rest } = patch;
    const cur = map.get(ticker);
    if (cur) {
      if (sector) cur.sector = sector;
      Object.assign(cur, rest);
    } else {
      map.set(ticker, {
        ticker,
        sector: sector ?? "Khác",
        companyName: null,
        held: false,
        label: null,
        buyLow: null,
        buyHigh: null,
        entry: null,
        stop: null,
        target: null,
        reason: null,
        plan: null,
        ref: null,
        corp: null,
        ...rest,
      });
    }
  };

  // Signal mới nhất — dedupe per ticker giữ rr cao nhất
  const best = new Map<string, (typeof signals)[number]>();
  for (const s of signals) {
    const cur = best.get(s.symbol.ticker);
    if (!cur || s.rr > cur.rr) best.set(s.symbol.ticker, s);
  }
  for (const s of best.values()) {
    put(s.symbol.ticker, {
      sector: s.symbol.sector,
      companyName: s.symbol.companyName,
      label: s.strategy.name,
      entry: s.entry,
      stop: s.stop,
      target: s.target,
      buyLow: s.buyLow,
      buyHigh: s.buyHigh,
      reason: s.reason,
      plan: s.plan,
    });
  }

  // Vị thế mở — có signal rồi thì chỉ gắn cờ held, giữ plan của signal
  for (const t of trades) {
    put(
      t.symbol.ticker,
      map.has(t.symbol.ticker)
        ? { sector: t.symbol.sector, companyName: t.symbol.companyName, held: true }
        : {
            sector: t.symbol.sector,
            companyName: t.symbol.companyName,
            held: true,
            label: "vị thế",
            entry: t.entryPrice,
            stop: t.stopPrice,
            target: t.targetPrice,
            reason: `${t.qty.toLocaleString("en-US")}cp @ ${t.entryPrice.toFixed(2)}`,
          },
    );
  }

  // Setup VN30 — chỉ bù ticker chưa có
  for (const r of vn30) {
    if (map.has(r.ticker)) continue;
    put(r.ticker, {
      sector: r.sector,
      label: r.setup,
      entry: r.buyZone ? null : r.close,
      buyLow: r.buyZone?.[0] ?? null,
      buyHigh: r.buyZone?.[1] ?? null,
      stop: r.stop ?? null,
      target: r.target ?? null,
      reason: r.note,
    });
  }

  // Danh sách theo dõi (trang Cài đặt) — ngành điền từ Symbol bên dưới
  for (const t of watchlist) if (!map.has(t)) put(t, { label: "theo dõi" });

  const tickers = [...map.keys()];
  if (!tickers.length) return [];
  const syms = await prisma.symbol.findMany({
    where: { ticker: { in: tickers } },
    select: { id: true, ticker: true, companyName: true, sector: true },
  });
  const symByTicker = new Map(syms.map((s) => [s.ticker, s]));
  for (const row of map.values()) {
    const s = symByTicker.get(row.ticker);
    if (!s) continue;
    row.companyName ??= s.companyName;
    if (row.sector === "Khác" && s.sector) row.sector = s.sector;
  }

  // Tham chiếu = close mới nhất trong DB (đã qua điều chỉnh GDKHQ)
  const ids = syms.map((s) => s.id);
  const latestBars = await prisma.dailyBar.findMany({
    where: { symbolId: { in: ids } },
    orderBy: { date: "desc" },
    distinct: ["symbolId"],
    select: { symbolId: true, close: true },
  });
  const refBySym = new Map(latestBars.map((b) => [b.symbolId, b.close]));
  for (const row of map.values()) {
    row.ref = refBySym.get(symByTicker.get(row.ticker)?.id ?? -1) ?? null;
  }

  // GDKHQ gần nhất per mã + giá trước/sau chia (bar cuối hưởng quyền)
  const cas = await prisma.corporateAction.findMany({
    where: { symbolId: { in: ids } },
    orderBy: { exDate: "desc" },
  });
  const latestCa = new Map<number, (typeof cas)[number]>();
  for (const ca of cas) if (!latestCa.has(ca.symbolId)) latestCa.set(ca.symbolId, ca);
  for (const [symbolId, ca] of latestCa) {
    const ticker = syms.find((s) => s.id === symbolId)?.ticker;
    const row = ticker ? map.get(ticker) : undefined;
    if (!row) continue;
    const pre = await prisma.dailyBar.findFirst({
      where: { symbolId, date: { lt: ca.exDate } },
      orderBy: { date: "desc" },
      select: { close: true },
    });
    row.corp = {
      exDate: ca.exDate,
      kind: ca.kind,
      factor: ca.factor,
      before: pre ? pre.close / ca.factor : null,
      after: pre?.close ?? null,
    };
  }

  return [...map.values()].sort(
    (a, b) => Number(b.held) - Number(a.held) || a.ticker.localeCompare(b.ticker),
  );
}
