import { prisma } from "./prisma";
import { STRATEGIES, ensureStrategies } from "./strategy";
import { positionSize } from "./risk/sizing";
import { getBool, getNum, getSetting } from "./settings";
import { notifySignal } from "./telegram/notify";
import type { Bar } from "./data/types";
import { VN30 } from "./data/vn30";

const BARS_NEEDED = 60;

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
  const navVnd = await getNum("navVnd");
  const riskPct = await getNum("riskPct");
  const minValue = await getNum("universeMinValueVnd");
  const universe = await getSetting("universe"); // vn30 | liquid | all
  const notify = opts?.notify ?? true;

  // Mã đang nắm giữ luôn được scan — bypass filter thanh khoản
  const heldTickers = new Set(
    (
      await prisma.trade.findMany({
        where: { status: "open" },
        include: { symbol: { select: { ticker: true } } },
      })
    ).map((t) => t.symbol.ticker),
  );

  // universe=vn30 → chỉ load bars 30 mã (+ mã đang giữ), nhẹ hơn nhiều trên serverless
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

  // Batch-load bars 1 query (serverless-friendly) thay vì query per-symbol
  const cutoff = new Date(Date.now() - 100 * 86400e3).toISOString().slice(0, 10);
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

  let filtered = 0;
  let signals = 0;
  let notified = 0;

  for (const sym of symbols) {
    const rows = (rowsBySymbol.get(sym.id) ?? []).slice(0, BARS_NEEDED);
    if (rows.length < BARS_NEEDED) continue;
    const bars: Bar[] = rows.reverse().map((r) => ({
      date: r.date,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
    }));

    // Universe filter — mã đang nắm giữ luôn được duyệt
    if (!heldTickers.has(sym.ticker)) {
      if (universe === "vn30") {
        if (!VN30.has(sym.ticker)) continue;
      } else if (universe === "liquid") {
        const last20 = rows.slice(0, 20);
        const avgValue = last20.reduce((s, r) => s + r.value, 0) / last20.length;
        if (avgValue < minValue) continue;
      }
    }
    filtered++;

    for (const st of strategies) {
      const impl = STRATEGIES[st.type];
      if (!impl) continue;
      const params = { ...impl.defaults, ...(JSON.parse(st.params) as Record<string, number>) };
      const cand = impl.fn({
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
        const ok = await notifySignal({
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
        });
        if (ok) {
          await prisma.signal.update({ where: { id: signal.id }, data: { status: "notified" } });
          notified++;
        }
      }
    }
  }

  return { scanned: symbols.length, filtered, signals, notified };
}
