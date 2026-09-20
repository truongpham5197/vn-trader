import { NextResponse } from "next/server";
import { placeSignalOrder } from "@/lib/orders";
import { cronAuthorized, cronForbidden } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/** POST /api/tcbs/order {signalId} — đặt lệnh theo tín hiệu (tôn trọng PAPER_TRADING). */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return cronForbidden();
  const body = (await req.json().catch(() => ({}))) as { signalId?: number };
  if (!body.signalId) return NextResponse.json({ error: "cần signalId" }, { status: 400 });
  const r = await placeSignalOrder(body.signalId);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
