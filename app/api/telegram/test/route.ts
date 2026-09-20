import { NextResponse } from "next/server";
import { sendTelegram, telegramConfigured } from "@/lib/telegram/notify";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!telegramConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Chưa cấu hình TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID" },
      { status: 400 },
    );
  }
  const ok = await sendTelegram("✅ vn-trader: Telegram kết nối OK");
  return NextResponse.json({ ok });
}
