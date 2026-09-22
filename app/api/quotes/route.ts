import { NextResponse } from "next/server";
import { getQuote } from "@/lib/price";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Giá gần realtime (nến 1m DNSE, trễ ~1ph) cho bảng nhóm ngành — client poll. */
export async function GET(req: Request) {
  const tickers = (new URL(req.url).searchParams.get("tickers") ?? "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 80);
  const out: Record<string, unknown> = {};
  await Promise.all(
    tickers.map(async (t) => {
      out[t] = await getQuote(t).catch(() => null);
    }),
  );
  return NextResponse.json(out);
}
