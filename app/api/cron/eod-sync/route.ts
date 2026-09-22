import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSymbols, syncDailyBars } from "@/lib/data/sync";
import { cronAuthorized, cronForbidden } from "@/lib/cron-auth";
import { getSetting, setSetting } from "@/lib/settings";
import { vnNow, vnToday } from "@/lib/vn-time";
import { runScan } from "@/lib/scan";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Hobby cap — toàn bộ work chạy trong after()

/** Cursor sync theo ngày VN — {"date","next":number|null,"pass","scanned"}. */
const CURSOR_KEY = "eodSyncCursor";
type Cursor = { date?: string; next?: number | null; pass?: number; scanned?: boolean };

// DNSE chưa chốt nến ngày ngay 15:00 — 2026-09-22 sync chạy 15:00–15:04 mất nến
// hôm nay của ~350/405 mã HOSE → pinger chỉ bắt đầu từ 15:10
const SETTLE_MIN = 15 * 60 + 10;
const MAX_PASS = 3;

/** Số nến HOSE hôm nay vs phiên trước — HOSE mã nào cũng khớp lệnh hằng ngày nên dùng đo độ phủ. */
async function hoseCoverage(today: string): Promise<{ now: number; prev: number }> {
  const where = (date: string) => ({ date, symbol: { exchange: "HOSE", active: true } });
  const prevDate = (
    await prisma.dailyBar.findFirst({ where: { date: { lt: today } }, orderBy: { date: "desc" }, select: { date: true } })
  )?.date;
  const [now, prev] = await Promise.all([
    prisma.dailyBar.count({ where: where(today) }),
    prevDate ? prisma.dailyBar.count({ where: where(prevDate) }) : 0,
  ]);
  return { now, prev };
}

async function handle(req: Request, body: Record<string, unknown>) {
  if (!cronAuthorized(req)) return cronForbidden();

  const limit = Number(body.limit ?? 25);
  const lookbackDays = Number(body.lookbackDays ?? 10);
  const onlyTickers = body.onlyTickers as string[] | undefined;
  const today = vnToday();

  // Resume theo cursor khi caller KHÔNG truyền offset (Vercel cron, pinger
  // cron-job.org…): chain after() hay đứt giữa chừng nên mỗi ping chạy tiếp
  // từ điểm dừng thay vì bắt đầu lại. Xong hết → ping kế tiếp chạy scan 1 lần,
  // sau đó done:true (ping rẻ).
  let offset = Number(body.offset ?? NaN);
  if (!onlyTickers && !Number.isFinite(offset)) {
    const n = vnNow();
    if (n.getHours() * 60 + n.getMinutes() < SETTLE_MIN) {
      return NextResponse.json({ skipped: "wait-settle", until: "15:10" });
    }
    const cur = JSON.parse((await getSetting(CURSOR_KEY)) || "null") as Cursor | null;
    if (cur?.date === today && cur.next === null) {
      if (cur.scanned) return NextResponse.json({ done: true, skipped: "eod-synced", date: today });
      // Scan ngay khi data đủ thay vì chờ Vercel cron (giờ là fallback) — runScan idempotent
      await setSetting(CURSOR_KEY, JSON.stringify({ ...cur, scanned: true }));
      after(() => runScan({ notify: true }).then((r) => console.log("[eod-sync] scan", r), (e) => console.error("[eod-sync] scan", e)));
      return NextResponse.json({ done: true, scan: "scheduled", date: today });
    }
    offset = cur?.date === today && typeof cur.next === "number" ? cur.next : 0;
  }
  if (!Number.isFinite(offset)) offset = 0;

  // URL của chính route này để chain — copy auth header cho hop sau
  const selfUrl = new URL(req.url).toString();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.CRON_SECRET) {
    headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
  }

  // Respond NGAY; batch + chain chạy trong after() — parent không phải chờ con,
  // nên không bao giờ vượt 60s và chain không đứt giữa chừng.
  after(async () => {
    try {
      let symbolCount = await prisma.symbol.count();
      if (body.withSymbols || symbolCount === 0) {
        symbolCount = await syncSymbols();
      }
      const r = await syncDailyBars({
        lookbackDays,
        onlyTickers,
        offset,
        limit,
        deadlineMs: 40_000,
      });
      let next = r.nextOffset;
      if (!onlyTickers) {
        const cur = JSON.parse((await getSetting(CURSOR_KEY)) || "null") as Cursor | null;
        let pass = cur?.date === today ? (cur.pass ?? 1) : 1;
        if (next === null) {
          // Hết 1 vòng mà HOSE thiếu nến hôm nay (DNSE chưa chốt) → quét lại từ đầu
          const cov = await hoseCoverage(today);
          if (cov.now < cov.prev * 0.8 && pass < MAX_PASS) {
            console.warn(`[eod-sync] HOSE ${cov.now}/${cov.prev} nến hôm nay → quét lại lượt ${pass + 1}`);
            next = 0;
            pass++;
          }
        }
        await setSetting(CURSOR_KEY, JSON.stringify({ date: today, next, pass }));
      }
      console.log(`[eod-sync] offset=${offset} done → next=${next}`);
      if (next !== null && !onlyTickers) {
        await fetch(selfUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ lookbackDays, offset: next, limit }),
        });
      }
    } catch (e) {
      // Lỗi thoáng qua (Neon/DNSE hiccup) → retry cùng offset, tối đa 3 lần
      const attempt = Number(body.attempt ?? 0);
      console.error(`[eod-sync] offset=${offset} attempt=${attempt} error`, e);
      if (attempt < 3 && !onlyTickers) {
        await fetch(selfUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ lookbackDays, offset, limit, attempt: attempt + 1 }),
        }).catch((e2) => console.error("[eod-sync] retry chain failed", e2));
      }
    }
  });

  return NextResponse.json({ scheduled: true, offset, limit, lookbackDays });
}

/** POST — chạy tay / chain nội bộ. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return handle(req, body);
}

/** GET — Vercel Cron gọi GET. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  return handle(req, Object.fromEntries(url.searchParams));
}
