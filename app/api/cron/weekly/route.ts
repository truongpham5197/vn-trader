import { NextResponse } from "next/server";
import { weeklyReport } from "@/lib/journal/report";
import { cronAuthorized, cronForbidden } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Báo cáo tuần — ping Chủ nhật tối từ cron ngoài (backup: scan tự gọi vào CN). Kèm tự học kiểm chứng backtest. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return cronForbidden();
  await weeklyReport();
  const { learnWeekly } = await import("@/lib/learn");
  const { tuned } = await learnWeekly().catch((e) => (console.error("[weekly] learn", e), { tuned: [] as string[] }));
  return NextResponse.json({ ok: true, tuned });
}

export async function POST(req: Request) {
  return GET(req);
}
