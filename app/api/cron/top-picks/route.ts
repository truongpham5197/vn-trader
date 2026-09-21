import { NextResponse } from "next/server";
import { runTopPicksDigest } from "@/lib/report/top-picks";
import { cronAuthorized, cronForbidden } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Digest top 5 mã tiềm năng (giá live vs vùng mua) — ping mỗi 5 phút trong
 * phiên bằng cron ngoài (cron-job.org…) vì Vercel Hobby cron chỉ daily.
 * ?force=1 để chạy cả ngoài giờ phiên.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return cronForbidden();
  const force = new URL(req.url).searchParams.get("force") === "1";
  const r = await runTopPicksDigest({ force });
  return NextResponse.json(r);
}

export async function POST(req: Request) {
  return GET(req);
}
