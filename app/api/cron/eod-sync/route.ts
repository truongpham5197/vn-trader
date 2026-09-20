import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSymbols, syncDailyBars } from "@/lib/data/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

/** POST /api/cron/eod-sync — body tùy chọn: {"lookbackDays": 10, "withSymbols": true} */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    lookbackDays?: number;
    withSymbols?: boolean;
    onlyTickers?: string[];
  };
  let symbolCount = await prisma.symbol.count();
  if (body.withSymbols || symbolCount === 0) {
    symbolCount = await syncSymbols();
  }
  const r = await syncDailyBars({
    lookbackDays: body.lookbackDays ?? 10,
    onlyTickers: body.onlyTickers,
  });
  return NextResponse.json({ symbols: symbolCount, ...r });
}
