import { NextResponse } from "next/server";
import { setSetting } from "@/lib/settings";
import { sendTelegram } from "@/lib/telegram/notify";
import { prisma } from "@/lib/prisma";
import { NEED_USER, ONLY_OWNER, currentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

const bool = (v: string) => v === "true" || v === "false";

// Key sửa được từ web (không cần đăng nhập — user chọn 2026-09-22). paperTrading KHÔNG có ở đây — chỉ đổi qua env (quy tắc an toàn).
// riskPct lưu dạng tỷ lệ (0.01 = 1%/lệnh) — chặn ≤ 3% để tránh gõ nhầm "1" thành 100%.
const EDITABLE: Record<string, (v: string) => boolean> = {
  navVnd: (v) => Number(v) >= 1e6,
  riskPct: (v) => Number(v) > 0 && Number(v) <= 0.03,
  universe: (v) => ["vn30", "liquid", "all"].includes(v),
  universeMinValueVnd: (v) => Number(v) >= 0,
  scanEnabled: bool,
  learnEnabled: bool,
  killSwitch: bool,
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { key?: string; value?: string } | null;
  const key = body?.key ?? "";
  const value = String(body?.value ?? "");
  if (!EDITABLE[key]?.(value)) return NextResponse.json({ error: "Giá trị không hợp lệ" }, { status: 400 });
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: NEED_USER }, { status: 401 });
  // Vốn/rủi ro: của riêng từng user (owner vẫn lưu ở Setting — bot/scan dùng). Còn lại là cấu hình hệ thống → chỉ owner.
  if (!u.owner) {
    if (key !== "navVnd" && key !== "riskPct") return NextResponse.json({ error: ONLY_OWNER }, { status: 403 });
    await prisma.user.update({ where: { id: u.id }, data: { [key]: Number(value) } });
    return NextResponse.json({ ok: true });
  }

  await setSetting(key, value);
  // Giống /kill: bật kill switch thì dừng luôn scanner
  if (key === "killSwitch" && value === "true") await setSetting("scanEnabled", "false");
  if (key === "killSwitch" || key === "scanEnabled" || key === "learnEnabled") {
    const msg =
      key === "killSwitch"
        ? value === "true" ? "🛑 KILL SWITCH ON (từ web) — scanner dừng, mọi order bị chặn." : "✅ Kill switch OFF (từ web)"
        : key === "learnEnabled"
          ? value === "true" ? "🧠 Tự học chiến lược ON (từ web)" : "⏸ Tự học chiến lược OFF (từ web) — giữ nguyên tham số hiện tại"
          : value === "true" ? "▶️ Scanner ON (từ web)" : "⏸ Scanner OFF (từ web)";
    await sendTelegram(msg, undefined, { kind: "system", level: key === "killSwitch" && value === "true" ? "danger" : "info", userId: null }).catch(() => false);
  }
  return NextResponse.json({ ok: true });
}
