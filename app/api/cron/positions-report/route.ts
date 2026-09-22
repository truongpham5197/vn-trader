import { NextResponse } from "next/server";
import { positionsReport } from "@/lib/report/positions";
import { positionsMessage } from "@/lib/report/portfolio";
import { sendTelegram } from "@/lib/telegram/notify";
import { cronAuthorized, cronForbidden } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Báo cáo vị thế live — ping định kỳ từ cron ngoài (vd 30 phút trong phiên). */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return cronForbidden();
  const lines = await positionsReport();
  if (lines.length) await sendTelegram(await positionsMessage(lines));
  return NextResponse.json({ positions: lines.length });
}

export async function POST(req: Request) {
  return GET(req);
}
