import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ALERT_KINDS } from "@/lib/alert-kinds";
import { NEED_USER, currentUser } from "@/lib/user";
import { bad, body } from "@/lib/api";
import { PERSONAS, variantOf } from "@/lib/persona";
import { ensurePersonas } from "@/lib/report/accountability";

export const dynamic = "force-dynamic";

type Row = { id: number; owner: boolean; alertKinds: string[]; tgChatId: string | null; persona: string | null; pushEnabled: boolean };

/** Số người khác đang dùng từng phong cách — được trùng, chỉ để user biết. Cùng phong cách vẫn khác câu (variantOf). */
async function others(id: number) {
  const rows = await prisma.user.findMany({ where: { id: { not: id }, persona: { not: null } }, select: { persona: true } });
  const n = new Map<string, number>();
  for (const r of rows) n.set(r.persona!, (n.get(r.persona!) ?? 0) + 1);
  return n;
}

async function me(u: Row) {
  const used = await others(u.id);
  const all = await prisma.user.findMany({ select: { id: true, persona: true } });
  return {
    owner: u.owner,
    alertKinds: u.alertKinds,
    pushEnabled: u.pushEnabled,
    telegramLinked: u.owner ? Boolean(process.env.TELEGRAM_CHAT_ID) : Boolean(u.tgChatId),
    persona: u.persona,
    variant: u.persona ? variantOf(all, u.id, u.persona) : 0,
    personas: PERSONAS.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, sample: p.lines.stop[0].replace(/\{t\}/g, "FPT").replace(/\{n\}/g, "bạn"), shared: used.get(p.id) ?? 0 })),
  };
}

// GET → cấu hình thông báo của user hiện tại (loại nhận qua Telegram riêng + thông báo đẩy + giọng thông báo)
export async function GET() {
  const u = await currentUser();
  if (!u) return bad(NEED_USER, 401);
  let row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
  if (!row.persona) {
    await ensurePersonas();
    row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
  }
  return NextResponse.json(await me(row));
}

// PATCH {alertKinds?: string[], persona?: string}
export async function PATCH(req: Request) {
  const u = await currentUser();
  if (!u) return bad(NEED_USER, 401);
  const { alertKinds, persona } = await body<{ alertKinds?: string[]; persona?: string }>(req);
  const data: { alertKinds?: string[]; persona?: string } = {};
  if (alertKinds !== undefined) {
    if (!Array.isArray(alertKinds) || alertKinds.some((k) => !(k in ALERT_KINDS))) return bad("Loại thông báo không hợp lệ");
    data.alertKinds = [...new Set(alertKinds)];
  }
  if (persona !== undefined) {
    if (!PERSONAS.some((p) => p.id === persona)) return bad("Phong cách không hợp lệ");
    data.persona = persona;
  }
  if (!Object.keys(data).length) return bad("Không có gì để lưu");
  const row = await prisma.user.update({ where: { id: u.id }, data });
  return NextResponse.json(await me(row));
}
