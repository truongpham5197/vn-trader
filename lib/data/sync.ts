import { prisma } from "../prisma";
import { listListedSymbols, listSectors, BAND_PCT } from "./vndirect";
import { fetchDailyBars } from "./dnse";
import { detectAdjustment, applyCorporateAction } from "../corp-action";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function syncSymbols(): Promise<number> {
  const listed = await listListedSymbols();
  const sectors = await listSectors().catch(() => new Map<string, string>());
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
        sector: sectors.get(s.ticker) ?? null,
        bandPct: BAND_PCT[s.exchange],
        kind: s.kind,
        active: true,
      },
      create: {
        ticker: s.ticker,
        exchange: s.exchange,
        companyName: s.companyName,
        sector: sectors.get(s.ticker) ?? null,
        bandPct: BAND_PCT[s.exchange],
        kind: s.kind,
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
  deadlineMs?: number;
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
  const t0 = Date.now();
  const deadlineMs = opts?.deadlineMs ?? 0;

  const failed: string[] = [];
  let done = 0;
  for (const s of symbols) {
    // Vượt ngân sách thời gian → dừng sớm, trả nextOffset để chain tiếp
    const budget = deadlineMs ? deadlineMs - (Date.now() - t0) : Infinity;
    if (budget <= 0) break;
    try {
      // Race fetch với budget còn lại — 1 mã treo không được giết cả batch.
      // Không có deadline thì fetch thẳng: setTimeout(Infinity) bị Node ép về 1ms
      // → mọi mã fail "deadline" (đã gặp 2026-09-22 ở node-cron local)
      const bars = Number.isFinite(budget)
        ? await Promise.race([
            fetchDailyBars(s.ticker, from, to),
            sleep(budget).then(() => {
              throw new Error("deadline");
            }),
          ])
        : await fetchDailyBars(s.ticker, from, to);
      if (bars.length) {
        const stored = await prisma.dailyBar.findMany({
          where: { symbolId: s.id, date: { gte: bars[0].date } },
          select: { id: true, date: true, open: true, high: true, low: true, close: true, volume: true },
        });
        // GDKHQ: DNSE điều chỉnh lùi lịch sử → fresh/stored lệch 1 hệ số đều nhau
        const act = detectAdjustment(stored, bars);
        if (act) {
          const seen = await prisma.corporateAction.findUnique({
            where: { symbolId_exDate: { symbolId: s.id, exDate: act.exDate } },
          });
          if (!seen) {
            await applyCorporateAction(s.id, s.ticker, act).catch((e) =>
              console.error(`[sync] corp-action ${s.ticker}`, e),
            );
          }
        }
        // Upsert: insert bar thiếu + sửa bar bị source revise (gồm cả trường
        // hợp adjust lùi mà detectAdjustment không nhận — vd quá ít overlap)
        const byDate = new Map(stored.map((r) => [r.date, r]));
        const toInsert = bars
          .filter((b) => !byDate.has(b.date))
          .map((b) => ({
            symbolId: s.id,
            date: b.date,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: b.volume,
            value: b.close * b.volume * 1000,
          }));
        if (toInsert.length) await prisma.dailyBar.createMany({ data: toInsert });
        for (const b of bars) {
          const ex = byDate.get(b.date);
          if (ex && Math.abs(ex.close - b.close) > 0.005) {
            await prisma.dailyBar.update({
              where: { id: ex.id },
              data: {
                open: b.open,
                high: b.high,
                low: b.low,
                close: b.close,
                volume: b.volume,
                value: b.close * b.volume * 1000,
              },
            });
          }
        }
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
  const nextOffset = offset + done < all.length ? offset + done : null;
  return { synced: done - failed.length, failed, total: all.length, nextOffset };
}
