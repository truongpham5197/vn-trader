import { NextResponse } from "next/server";
import { runScan } from "@/lib/scan";
import { runWatcher } from "@/lib/tcbs/watcher";
import { cronAuthorized, cronForbidden } from "@/lib/cron-auth";
import { pruneAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request, notify: boolean) {
  if (!cronAuthorized(req)) return cronForbidden();
  const r = await runScan({ notify });
  const { runSignalHealth } = await import("@/lib/report/signal-health");
  const expired = await runSignalHealth().catch((e) => {
    console.error("[scan] signal-health", e);
    return 0;
  });

  // EOD stop-check + target alert trên giá close vừa sync (backup cho watcher intraday)
  await runWatcher().catch((e) => console.error("[scan] watcher EOD", e));

  // Dọn thông báo web quá hạn (positions 2 ngày, sector 3 ngày, còn lại 7 ngày)
  await pruneAlerts().catch((e) => console.error("[scan] prune alerts", e));

  // Chủ nhật → kèm báo cáo tuần (Hobby cron chỉ daily — gộp vào scan)
  const dow = new Date().toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Ho_Chi_Minh" });
  if (dow === "Sun") {
    const { weeklyReport } = await import("@/lib/journal/report");
    await weeklyReport().catch((e) => console.error("[scan] weekly", e));
    const { learnWeekly } = await import("@/lib/learn");
    await learnWeekly().catch((e) => console.error("[scan] learn-weekly", e));
  }

  return NextResponse.json({ ...r, expired });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { notify?: boolean };
  return handle(req, body.notify ?? true);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  return handle(req, url.searchParams.get("notify") !== "false");
}
