import { NextResponse } from "next/server";
import { weeklyReport } from "@/lib/journal/report";
import { cronAuthorized, cronForbidden } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Báo cáo tuần — ping Chủ nhật tối từ cron ngoài (backup: scan tự gọi vào CN). */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return cronForbidden();
  await weeklyReport();
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  return GET(req);
}
