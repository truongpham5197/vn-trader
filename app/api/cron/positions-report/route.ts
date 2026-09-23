import { NextResponse } from "next/server";
import { positionsReport } from "@/lib/report/positions";
import { positionsMessage } from "@/lib/report/portfolio";
import { sendTelegram } from "@/lib/telegram/notify";
import { pushAlert } from "@/lib/alerts";
import { prisma } from "@/lib/prisma";
import { cronAuthorized, cronForbidden } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Báo cáo vị thế live — ping định kỳ từ cron ngoài (vd 30 phút trong phiên). */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return cronForbidden();
  const lines = await positionsReport();
  if (lines.length) await sendTelegram(await positionsMessage(lines), undefined, { kind: "positions" });
  // User khác owner: báo cáo chỉ hiện trên web của họ
  const others = await prisma.user.findMany({ where: { owner: false, trades: { some: { status: "open" } } } });
  for (const u of others) await pushAlert(await positionsMessage(undefined, u), { kind: "positions", userId: u.id });
  return NextResponse.json({ positions: lines.length, users: others.length });
}

export async function POST(req: Request) {
  return GET(req);
}
