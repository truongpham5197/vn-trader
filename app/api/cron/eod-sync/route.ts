import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSymbols, syncDailyBars } from "@/lib/data/sync";
import { cronAuthorized, cronForbidden } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Hobby cap — toàn bộ work chạy trong after()

async function handle(req: Request, body: Record<string, unknown>) {
  if (!cronAuthorized(req)) return cronForbidden();

  const offset = Number(body.offset ?? 0);
  const limit = Number(body.limit ?? 25);
  const lookbackDays = Number(body.lookbackDays ?? 10);
  const onlyTickers = body.onlyTickers as string[] | undefined;

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
      console.log(`[eod-sync] offset=${offset} done → next=${r.nextOffset}`);
      if (r.nextOffset !== null && !onlyTickers) {
        await fetch(selfUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ lookbackDays, offset: r.nextOffset, limit }),
        });
      }
    } catch (e) {
      console.error("[eod-sync] batch/chain error", e);
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
