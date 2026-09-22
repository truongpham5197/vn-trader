import { NextResponse } from "next/server";
import { setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Chỉ các key được phép sửa từ UI — killSwitch/scanEnabled vẫn qua Telegram/env
const EDITABLE: Record<string, (v: string) => boolean> = {
  navVnd: (v) => Number(v) > 0,
  riskPct: (v) => Number(v) > 0 && Number(v) <= 5,
  universe: (v) => ["vn30", "liquid", "all"].includes(v),
  topPicksEnabled: (v) => ["true", "false"].includes(v),
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { key?: string; value?: string } | null;
  if (!body?.key || !EDITABLE[body.key]?.(body.value ?? "")) {
    return NextResponse.json({ error: "key không hợp lệ" }, { status: 400 });
  }
  await setSetting(body.key, String(body.value));
  return NextResponse.json({ ok: true });
}
