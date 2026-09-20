import { NextResponse } from "next/server";
import { authenticate, tcbsConfigured } from "@/lib/tcbs/client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!tcbsConfigured()) {
    return NextResponse.json(
      { error: "Chưa cấu hình TCBS_API_KEY/TCBS_ACCOUNT_NO trong .env" },
      { status: 400 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as { otp?: string };
  if (!body.otp) return NextResponse.json({ error: "cần otp" }, { status: 400 });
  const ok = await authenticate(body.otp);
  return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
}
