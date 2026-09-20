import { NextResponse } from "next/server";
import { runScan } from "@/lib/scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/cron/scan — body tùy chọn: {"notify": false} */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { notify?: boolean };
  const r = await runScan({ notify: body.notify });
  return NextResponse.json(r);
}
