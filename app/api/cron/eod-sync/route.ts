import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSymbols, syncDailyBars } from "@/lib/data/sync";
import { cronAuthorized, cronForbidden } from "@/lib/cron-auth";
import { getSetting, setSetting } from "@/lib/settings";
import { vnToday } from "@/lib/vn-time";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Hobby cap — toàn bộ work chạy trong after()

/** Cursor sync theo ngày VN — {"date":"YYYY-MM-DD","next":number|null}. */
const CURSOR_KEY = "eodSyncCursor";

async function handle(req: Request, body: Record<string, unknown>) {
  if (!cronAuthorized(req)) return cronForbidden();

  const limit = Number(body.limit ?? 25);
  const lookbackDays = Number(body.lookbackDays ?? 10);
  const onlyTickers = body.onlyTickers as string[] | undefined;
  const today = vnToday();

  // Resume theo cursor khi caller KHÔNG truyền offset (Vercel cron, pinger
  // cron-job.org…): chain after() hay đứt giữa chừng nên mỗi ping chạy tiếp
  // từ điểm dừng thay vì bắt đầu lại. Xong hết → done:true (ping rẻ).
  let offset = Number(body.offset ?? NaN);
  if (!onlyTickers && !Number.isFinite(offset)) {
    const cur = JSON.parse((await getSetting(CURSOR_KEY)) || "null") as {
      date?: string;
      next?: number | null;
    } | null;
    if (cur?.date === today && cur.next === null) {
      return NextResponse.json({ done: true, skipped: "eod-synced", date: today });
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
      if (!onlyTickers) {
        await setSetting(CURSOR_KEY, JSON.stringify({ date: today, next: r.nextOffset }));
      }
      console.log(`[eod-sync] offset=${offset} done → next=${r.nextOffset}`);
      if (r.nextOffset !== null && !onlyTickers) {
        await fetch(selfUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ lookbackDays, offset: r.nextOffset, limit }),
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
