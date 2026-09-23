import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { botUsername } from "@/lib/telegram/send";
import { NEED_USER, currentUser } from "@/lib/user";
import { bad } from "@/lib/api";

export const dynamic = "force-dynamic";

// POST → mã liên kết 1 lần + link t.me/<bot>?start=<mã>; bot nhận /start <mã> thì gắn chat với user
export async function POST() {
  const u = await currentUser();
  if (!u) return bad(NEED_USER, 401);
  if (u.owner) return bad("Chủ app đã nhận Telegram qua bot chính");
  const code = randomBytes(9).toString("base64url");
  await prisma.user.update({ where: { id: u.id }, data: { tgLinkCode: code } });
  const bot = await botUsername();
  return NextResponse.json({ code, bot, url: bot ? `https://t.me/${bot}?start=${code}` : null });
}

// DELETE → ngắt Telegram riêng
export async function DELETE() {
  const u = await currentUser();
  if (!u) return bad(NEED_USER, 401);
  await prisma.user.update({ where: { id: u.id }, data: { tgChatId: null, tgLinkCode: null } });
  return NextResponse.json({ ok: true });
}
