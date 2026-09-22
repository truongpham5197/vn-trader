import { NextResponse } from "next/server";
import { setSetting } from "@/lib/settings";
import { adminAuthorized } from "@/lib/admin-auth";
import { cronForbidden } from "@/lib/cron-auth";
import { sendTelegram } from "@/lib/telegram/notify";

export const dynamic = "force-dynamic";

const bool = (v: string) => v === "true" || v === "false";

// Key sửa được từ web. paperTrading KHÔNG có ở đây — chỉ đổi qua env (quy tắc an toàn).
// riskPct lưu dạng tỷ lệ (0.01 = 1%/lệnh) — chặn ≤ 3% để tránh gõ nhầm "1" thành 100%.
const EDITABLE: Record<string, (v: string) => boolean> = {
  navVnd: (v) => Number(v) >= 1e6,
  riskPct: (v) => Number(v) > 0 && Number(v) <= 0.03,
  universe: (v) => ["vn30", "liquid", "all"].includes(v),
  universeMinValueVnd: (v) => Number(v) >= 0,
  scanEnabled: bool,
  killSwitch: bool,
};

export async function POST(req: Request) {
  if (!(await adminAuthorized(req))) return cronForbidden();
  const body = (await req.json().catch(() => null)) as { key?: string; value?: string } | null;
  const key = body?.key ?? "";
  const value = String(body?.value ?? "");
  if (!EDITABLE[key]?.(value)) return NextResponse.json({ error: "Giá trị không hợp lệ" }, { status: 400 });

  await setSetting(key, value);
  // Giống /kill: bật kill switch thì dừng luôn scanner
  if (key === "killSwitch" && value === "true") await setSetting("scanEnabled", "false");
  if (key === "killSwitch" || key === "scanEnabled") {
    const msg =
      key === "killSwitch"
        ? value === "true" ? "🛑 KILL SWITCH ON (từ web) — scanner dừng, mọi order bị chặn." : "✅ Kill switch OFF (từ web)"
        : value === "true" ? "▶️ Scanner ON (từ web)" : "⏸ Scanner OFF (từ web)";
    await sendTelegram(msg).catch(() => false);
  }
  return NextResponse.json({ ok: true });
}
