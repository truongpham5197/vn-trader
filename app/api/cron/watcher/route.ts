import { NextResponse, after } from "next/server";
import { runWatcher } from "@/lib/tcbs/watcher";
import { runSectorAlerts } from "@/lib/analysis/sector-live";
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
  // Cơ hội trong phiên (tự giãn 5 phút/lần) — chạy sau response, không chặn watcher
  after(() => runSectorAlerts().catch((e) => console.error("[sector-alerts]", e)));
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  return GET(req);
}
