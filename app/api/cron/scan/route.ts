import { NextResponse } from "next/server";
import { runScan } from "@/lib/scan";
import { runWatcher } from "@/lib/tcbs/watcher";
import { cronAuthorized, cronForbidden } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request, notify: boolean) {
  if (!cronAuthorized(req)) return cronForbidden();
  const r = await runScan({ notify });

  // EOD stop-check + target alert trên giá close vừa sync (backup cho watcher intraday)
  await runWatcher().catch((e) => console.error("[scan] watcher EOD", e));

  // Chủ nhật → kèm báo cáo tuần (Hobby cron chỉ daily — gộp vào scan)
  const dow = new Date().toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Ho_Chi_Minh" });
  if (dow === "Sun") {
    const { weeklyReport } = await import("@/lib/journal/report");
    await weeklyReport().catch((e) => console.error("[scan] weekly", e));
  }

  return NextResponse.json(r);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { notify?: boolean };
  return handle(req, body.notify ?? true);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  return handle(req, url.searchParams.get("notify") !== "false");
}
