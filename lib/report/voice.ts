import { prisma } from "../prisma";
import { ownerId } from "../user";
import { esc } from "../telegram/notify";
import { personaById, say, variantOf, type Persona, type Slot } from "../persona";
import { ensurePersonas } from "./accountability";
import { vnToday } from "../vn-time";
import { adviceStyle } from "../persona-style";

export interface Voice {
  p: Persona;
  name: string;
  variant: number; // thứ tự trong nhóm cùng phong cách — cùng phong cách vẫn khác câu
}

/** Giọng của 1 user (bỏ trống = owner). User chưa có phong cách → gán mặc định trải đều. */
export async function voiceOf(userId?: number | null): Promise<Voice> {
  const id = userId ?? (await ownerId());
  let users = await prisma.user.findMany({ select: { id: true, username: true, persona: true } });
  if (users.some((u) => u.id === id && !u.persona)) {
    await ensurePersonas();
    users = await prisma.user.findMany({ select: { id: true, username: true, persona: true } });
  }
  const u = users.find((x) => x.id === id);
  const p = personaById(u?.persona);
  return { p, name: u?.username ?? "bạn", variant: variantOf(users, id, p.id) };
}

/** 1 câu HTML đã escape — đổi câu theo ngày + mã, ổn định trong ngày. */
export const voiceLine = (v: Voice, slot: Slot, ticker = "") =>
  `${v.p.emoji} ${esc(say(v.p, slot, { t: ticker, n: v.name }, `${vnToday()}|${ticker}`, v.variant))}`;

/** Câu mở báo cáo vị thế: mã tăng/giảm mạnh nhất rổ hôm nay. */
export function moversLine(v: Voice, lines: { ticker: string; dayPct: number | null }[]): string {
  const xs = lines.filter((l) => l.dayPct !== null).sort((a, b) => b.dayPct! - a.dayPct!);
  if (!xs.length) return "";
  const out: string[] = [];
  const top = xs[0];
  const bot = xs[xs.length - 1];
  if (top.dayPct! > 0) out.push(`${voiceLine(v, "up", top.ticker)} (${top.dayPct!.toFixed(1)}%)`);
  if (bot.dayPct! < 0 && bot !== top) out.push(`${voiceLine(v, "down", bot.ticker)} (${bot.dayPct!.toFixed(1)}%)`);
  return out.join("\n");
}

/** Văn phong lời khuyên/giải thích của user (lib/persona-style.ts). */
export const styleOf = (v: Voice) => adviceStyle(v.p.id, v.variant);
