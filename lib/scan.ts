import { prisma } from "./prisma";
import { STRATEGIES, ensureStrategies } from "./strategy";
import { positionSize } from "./risk/sizing";
import { getBool, getNum, getSetting, setSetting } from "./settings";
import { loadPortfolio } from "./report/portfolio";
import { notifySignal } from "./telegram/notify";
import { VN30 } from "./data/vn30";
import { allWatchlists } from "./trades";
import { fetchFundamentals, formatFundamentalsTg } from "./data/fundamentals";
import { inVnSession, vnToday } from "./vn-time";
import {
  avgValueNewest,
  barsRequired,
  batchCompletedDate,
  canGenerateBuy,
  dropUnfinishedSession,
  isFreshVsBatch,
  maxRequiredBars,
  requiredHistory,
  shouldPersistScanDate,
  toAscendingBars,
} from "./scan-history";

export interface ScanResult {
  scanned: number;
  filtered: number;
  signals: number;
  notified: number;
  skippedReason?: string;
}

export async function runScan(opts?: { notify?: boolean }): Promise<ScanResult> {
  if (await getBool("killSwitch")) {
    return { scanned: 0, filtered: 0, signals: 0, notified: 0, skippedReason: "kill-switch" };
  }
  if (!(await getBool("scanEnabled"))) {
    return { scanned: 0, filtered: 0, signals: 0, notified: 0, skippedReason: "scan-disabled" };
  }

  const strategies = (await ensureStrategies(prisma)) as {
    id: number;
    name: string;
    type: string;
    params: string;
  }[];
  // Size lệnh theo NAV thực (vốn + lãi/lỗ đã chốt + tạm tính), không phải vốn ban đầu
  const navVnd = (await loadPortfolio()).nav;
  const riskPct = await getNum("riskPct");
  const minValue = await getNum("universeMinValueVnd");
  const universe = await getSetting("universe"); // vn30 | liquid | all
  const notify = opts?.notify ?? true;

  // Mã đang nắm giữ + danh sách theo dõi (mọi user) luôn được scan — bypass filter thanh khoản (chỉ để xem)
  const heldTickers = new Set([
    ...(
      await prisma.trade.findMany({
        where: { status: "open" },
        include: { symbol: { select: { ticker: true } } },
      })
    ).map((t) => t.symbol.ticker),
    ...(await allWatchlists()),
  ]);

  // universe=vn30 → chỉ load bars 30 mã (+ mã đang giữ/theo dõi), nhẹ hơn nhiều trên serverless
  const vn30Only = universe === "vn30";
  const symbols = await prisma.symbol.findMany({
    where: {
      active: true,
      ...(vn30Only
        ? { OR: [{ ticker: { in: [...VN30] } }, { ticker: { in: [...heldTickers] } }] }
        : {}),
    },
    select: { id: true, ticker: true, exchange: true, bandPct: true, sector: true },
  });

  const enabled = strategies
    .map((st) => {
      const def = STRATEGIES[st.type];
      if (!def) return null;
      const params = { ...def.defaults, ...(JSON.parse(st.params) as Record<string, number>) };
      return { st, def, params };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const maxBars = maxRequiredBars(enabled.map((e) => ({ def: e.def, params: e.params })));
  const { cutoff } = requiredHistory(maxBars);

  const allRows = await prisma.dailyBar.findMany({
    where: { symbolId: { in: symbols.map((s) => s.id) }, date: { gte: cutoff } },
    orderBy: [{ symbolId: "asc" }, { date: "desc" }],
  });
  const rowsBySymbol = new Map<number, typeof allRows>();
  for (const r of allRows) {
    const arr = rowsBySymbol.get(r.symbolId) ?? [];
    arr.push(r);
    rowsBySymbol.set(r.symbolId, arr);
  }

  const today = vnToday();
  const inSession = inVnSession();
  const completed = batchCompletedDate(
    allRows.map((r) => r.date),
    { today, inSession },
  );

  let filtered = 0;
  let signals = 0;
  let notified = 0;
  const pending: Parameters<typeof notifySignal>[0][] = [];

  for (const sym of symbols) {
    const raw = rowsBySymbol.get(sym.id) ?? [];
    const rows = dropUnfinishedSession(raw, { today, inSession });
    if (rows.length === 0) continue;
    if (!isFreshVsBatch(rows[0]?.date, completed)) continue;

    const held = heldTickers.has(sym.ticker);
    const liquid = avgValueNewest(rows, 20) >= minValue;
    if (!held) {
      if (universe === "vn30" && !VN30.has(sym.ticker)) continue;
      if (universe === "liquid" && !liquid) continue;
    }

    // Held/watchlist illiquid vẫn đếm filtered (xem), không BUY phía dưới
    filtered++;

    const take = maxBars > 0 ? rows.slice(0, maxBars) : rows;
    const bars = toAscendingBars(take);

    for (const { st, def, params } of enabled) {
      const historyOk = bars.length >= barsRequired(def, params);
      if (!canGenerateBuy({ liquid, historyOk })) continue;

      const cand = def.fn({
        ticker: sym.ticker,
        exchange: sym.exchange,
        bandPct: sym.bandPct,
        bars,
        params,
      });
      if (!cand) continue;

      const size = positionSize({ navVnd, riskPct, entry: cand.entry, stop: cand.stop });
      if (size.qty <= 0) continue;

      const signal = await prisma.signal.upsert({
        where: {
          strategyId_symbolId_date: {
            strategyId: st.id,
            symbolId: sym.id,
            date: bars[bars.length - 1].date,
          },
        },
        update: {},
        create: {
          strategyId: st.id,
          symbolId: sym.id,
          date: bars[bars.length - 1].date,
          entry: cand.entry,
          stop: cand.stop,
          target: cand.target,
          qty: size.qty,
          rr: cand.rr,
          reason: cand.reason,
          plan: cand.plan,
          buyLow: cand.buyZone?.[0],
          buyHigh: cand.buyZone?.[1],
          status: "new",
        },
        include: { symbol: true },
      });
      signals++;

      if (notify && signal.status === "new") {
        pending.push({
          signalId: signal.id,
          ticker: sym.ticker,
          sector: sym.sector ?? undefined,
          strategy: st.name,
          entry: cand.entry,
          stop: cand.stop,
          target: cand.target,
          qty: size.qty,
          valueVnd: size.valueVnd,
          rr: cand.rr,
          reason: cand.reason,
          plan: cand.plan,
          buyZone: cand.buyZone,
          dayBar: bars[bars.length - 1],
          ref: bars[bars.length - 2]?.close,
        });
      }
    }
  }

  const prevScanDate = await getSetting("latestScanDate");
  if (completed && shouldPersistScanDate(prevScanDate, completed)) {
    await setSetting("latestScanDate", completed);
  }

  // Kèm tình hình kinh doanh + tin công bố — lấy song song, tối đa 6s, lỗi thì gửi không kèm
  const fund = new Map(
    await Promise.all(
      [...new Set(pending.map((p) => p.ticker))].slice(0, 20).map(async (t) => {
        const f = await Promise.race([fetchFundamentals(t).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 6000))]);
        return [t, f ? formatFundamentalsTg(f) : undefined] as const;
      }),
    ),
  );
  for (const p of pending) {
    if (await notifySignal({ ...p, fundamentals: fund.get(p.ticker) })) {
      await prisma.signal.update({ where: { id: p.signalId }, data: { status: "notified" } });
      notified++;
    }
  }

  return { scanned: symbols.length, filtered, signals, notified };
}
