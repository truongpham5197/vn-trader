import { NextResponse } from "next/server";
import { runWatcher } from "@/lib/tcbs/watcher";
import { cronAuthorized, cronForbidden } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Stop-loss watcher — ping mỗi 1-5 phút trong phiên bằng cron ngoài
 * (cron-job.org…) vì Vercel Hobby cron chỉ daily.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return cronForbidden();
  await runWatcher();
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  return GET(req);
}
