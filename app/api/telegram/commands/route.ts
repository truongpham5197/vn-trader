import { NextResponse } from "next/server";
import { cronAuthorized, cronForbidden } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

// Menu lệnh hiện khi gõ "/" trong Telegram — thay cho @BotFather /setcommands
const COMMANDS: [string, string][] = [
  ["nganh", "Xếp hạng nhóm ngành + mã đáng chú ý"],
  ["status", "Tình trạng hệ thống"],
  ["positions", "Vị thế đang giữ"],
  ["signals", "Tín hiệu phiên gần nhất"],
  ["cb", "Kinh doanh + tin công bố: /cb MÃ"],
  ["orders", "Lệnh gần đây"],
  ["vn30", "Setup VN30"],
  ["picks", "Top mã gợi ý"],
  ["plan", "Gợi ý cắt lỗ/chốt lời: /plan MÃ"],
  ["add", "Ghi vị thế mua: /add MÃ SL GIÁ"],
  ["close", "Đóng vị thế"],
  ["pause", "Tạm dừng quét"],
  ["resume", "Bật lại quét + tắt kill switch"],
  ["kill", "Dừng khẩn cấp mọi lệnh"],
  ["otp", "Đăng nhập TCBS bằng OTP"],
  ["auth", "Kiểm tra kết nối TCBS"],
  ["help", "Giải thích thuật ngữ"],
];

/** POST — đăng ký menu lệnh bot (chạy trên Vercel vì mạng local có thể chặn Telegram). */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return cronForbidden();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ ok: false, error: "thiếu TELEGRAM_BOT_TOKEN" }, { status: 400 });
  const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands: COMMANDS.map(([command, description]) => ({ command, description })) }),
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  return NextResponse.json({ ok: Boolean(j.ok), error: j.description }, { status: j.ok ? 200 : 502 });
}
