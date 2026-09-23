import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ALERT_KINDS } from "@/lib/alert-kinds";
import { NEED_USER, currentUser } from "@/lib/user";
import { bad, body } from "@/lib/api";

export const dynamic = "force-dynamic";

const me = (u: { owner: boolean; alertKinds: string[]; tgChatId: string | null }) => ({
  owner: u.owner,
  alertKinds: u.alertKinds,
  telegramLinked: u.owner ? Boolean(process.env.TELEGRAM_CHAT_ID) : Boolean(u.tgChatId),
});

// GET → cấu hình thông báo của user hiện tại (loại nhận qua Telegram riêng + thông báo đẩy)
export async function GET() {
  const u = await currentUser();
  if (!u) return bad(NEED_USER, 401);
  const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
  return NextResponse.json(me(row));
}

// PATCH {alertKinds: string[]}
export async function PATCH(req: Request) {
  const u = await currentUser();
  if (!u) return bad(NEED_USER, 401);
  const { alertKinds } = await body<{ alertKinds: string[] }>(req);
  if (!Array.isArray(alertKinds) || alertKinds.some((k) => !(k in ALERT_KINDS))) return bad("Loại thông báo không hợp lệ");
  const row = await prisma.user.update({ where: { id: u.id }, data: { alertKinds: [...new Set(alertKinds)] } });
  return NextResponse.json(me(row));
}
