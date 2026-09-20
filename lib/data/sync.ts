import { prisma } from "../prisma";
import { listListedSymbols, BAND_PCT } from "./vndirect";
import { fetchDailyBars } from "./dnse";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function syncSymbols(): Promise<number> {
  const listed = await listListedSymbols();
  const tickers = listed.map((s) => s.ticker);
  // Mã rớt khỏi list niêm yết → đánh dấu ngừng theo dõi
  await prisma.symbol.updateMany({
    where: { ticker: { notIn: tickers }, active: true },
    data: { active: false },
  });
  let count = 0;
  for (const s of listed) {
    await prisma.symbol.upsert({
      where: { ticker: s.ticker },
      update: {
        exchange: s.exchange,
        companyName: s.companyName,
        bandPct: BAND_PCT[s.exchange],
        active: true,
      },
      create: {
        ticker: s.ticker,
        exchange: s.exchange,
        companyName: s.companyName,
        bandPct: BAND_PCT[s.exchange],
      },
    });
    count++;
  }
  return count;
}

/**
 * Đồng bộ daily bars cho toàn bộ symbol active.
 * lookbackDays: 120 cho lần đầu / full refresh; 10 cho sync EOD hằng ngày.
 */
export async function syncDailyBars(opts?: {
  lookbackDays?: number;
  onlyTickers?: string[];
  delayMs?: number;
  offset?: number;
  limit?: number;
  onProgress?: (done: number, total: number, ticker: string) => void;
}): Promise<{ synced: number; failed: string[]; total: number; nextOffset: number | null }> {
  const lookbackDays = opts?.lookbackDays ?? 10;
  const delayMs = opts?.delayMs ?? 120;
  const to = new Date();
  const from = new Date(to.getTime() - lookbackDays * 24 * 3600 * 1000);

  const all = await prisma.symbol.findMany({
    where: { active: true, ...(opts?.onlyTickers ? { ticker: { in: opts.onlyTickers } } : {}) },
    select: { id: true, ticker: true },
    orderBy: { id: "asc" },
  });
  const offset = opts?.offset ?? 0;
  const symbols = opts?.limit ? all.slice(offset, offset + opts.limit) : all.slice(offset);
  const nextOffset = offset + symbols.length < all.length ? offset + symbols.length : null;

  const failed: string[] = [];
  let done = 0;
  for (const s of symbols) {
    try {
      const bars = await fetchDailyBars(s.ticker, from, to);
      for (const b of bars) {
        await prisma.dailyBar.upsert({
          where: { symbolId_date: { symbolId: s.id, date: b.date } },
          update: {
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: b.volume,
            value: b.close * b.volume * 1000,
          },
          create: {
            symbolId: s.id,
            date: b.date,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: b.volume,
            value: b.close * b.volume * 1000,
          },
        });
      }
      if (bars.length === 0) {
        await prisma.dataGap.create({
          data: { symbolId: s.id, date: to.toISOString().slice(0, 10), reason: "empty-bars" },
        });
      }
    } catch (e) {
      failed.push(s.ticker);
      await prisma.dataGap.create({
        data: {
          symbolId: s.id,
          date: to.toISOString().slice(0, 10),
          reason: e instanceof Error ? e.message.slice(0, 200) : "unknown",
        },
      });
    }
    done++;
    opts?.onProgress?.(offset + done, all.length, s.ticker);
    if (delayMs > 0) await sleep(delayMs);
  }
  return { synced: symbols.length - failed.length, failed, total: all.length, nextOffset };
}
