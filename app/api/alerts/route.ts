import { NextResponse } from "next/server";
import { listAlerts } from "@/lib/alerts";
import { currentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

// GET ?after=ID → thông báo mới của user đang chọn (+ thông báo chung); không có after = 30 cái gần nhất
export async function GET(req: Request) {
  const after = Math.max(0, Number(new URL(req.url).searchParams.get("after")) || 0);
  const u = await currentUser();
  return NextResponse.json(await listAlerts(u?.id ?? 0, after));
}
