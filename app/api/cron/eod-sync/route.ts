import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSymbols, syncDailyBars } from "@/lib/data/sync";
import { cronAuthorized, cronForbidden } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Hobby cap — chunk + self-chain bù phần còn lại

async function handle(req: Request, body: Record<string, unknown>) {
  if (!cronAuthorized(req)) return cronForbidden();

  let symbolCount = await prisma.symbol.count();
  if (body.withSymbols || symbolCount === 0) {
    symbolCount = await syncSymbols();
  }

  const offset = Number(body.offset ?? 0);
  const limit = Number(body.limit ?? 25);
  const lookbackDays = Number(body.lookbackDays ?? 10);
  const onlyTickers = body.onlyTickers as string[] | undefined;

  const r = await syncDailyBars({ lookbackDays, onlyTickers, offset, limit, deadlineMs: 40_000 });

  // Còn batch sau → tự chain 1 invocation mới (Vercel function chỉ sống ~60s)
  if (r.nextOffset !== null && !onlyTickers) {
    const url = new URL(req.url);
    const next = new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.CRON_SECRET
          ? { authorization: `Bearer ${process.env.CRON_SECRET}` }
          : {}),
      },
      body: JSON.stringify({ lookbackDays, offset: r.nextOffset, limit }),
    });
    after(async () => {
      await fetch(next).catch((e) => console.error("[eod-sync] chain failed", e));
    });
  }

  return NextResponse.json({ symbols: symbolCount, offset, ...r });
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
