import { prisma } from "./prisma";
import { ownerId } from "./user";
import type { AlertItem, AlertKind, AlertLevel, WebAlert } from "./alert-kinds";

export * from "./alert-kinds";

const KEEP_DAYS = 7;

/** HTML Telegram → text thường: dòng đầu = tiêu đề, phần còn lại = nội dung. */
export function htmlToAlert(html: string): { title: string; body: string } {
  const text = html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
  const [title, ...rest] = text.split("\n");
  return { title: title.trim().slice(0, 200), body: rest.join("\n").trim().slice(0, 1500) };
}

/** Ghi thông báo web — lỗi DB không được làm hỏng luồng cron/Telegram. */
export async function pushAlert(html: string, a: WebAlert): Promise<void> {
  try {
    const { title, body } = htmlToAlert(html);
    const userId = a.userId === undefined ? await ownerId() : a.userId;
    const row = await prisma.alert.create({ data: { kind: a.kind, level: a.level ?? "info", title, body, ticker: a.ticker ?? null, userId } });
    if (row.id % 50 === 0) await prisma.alert.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86400e3) } } });
  } catch (e) {
    console.error("[alerts] push", e);
  }
}

/** Thông báo của user (gồm thông báo chung), id > after, mới nhất trước. */
export async function listAlerts(userId: number, after = 0, take = 30): Promise<AlertItem[]> {
  const rows = await prisma.alert.findMany({
    where: { id: { gt: after }, OR: [{ userId: null }, ...(userId ? [{ userId }] : [])] },
    orderBy: { id: "desc" },
    take,
  });
  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    kind: r.kind as AlertKind,
    level: r.level as AlertLevel,
    title: r.title,
    body: r.body,
    ticker: r.ticker,
  }));
}
