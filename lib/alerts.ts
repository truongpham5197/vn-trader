import { prisma } from "./prisma";
import { ownerId } from "./user";
import { sendPush } from "./push";
import { tgSend } from "./telegram/send";
import { alertHref, type AlertItem, type AlertKind, type AlertLevel, type WebAlert } from "./alert-kinds";

export * from "./alert-kinds";

/** Số ngày giữ thông báo theo loại — báo cáo vị thế (30 phút/lần × mỗi user) sinh nhiều nhất, giữ ngắn. */
export const KEEP_DAYS: Record<AlertKind, number> = { positions: 2, sector: 3, signal: 7, stop: 7, target: 7, system: 7 };
let lastPrune = 0;

/** Xóa thông báo quá hạn (theo loại) — gọi từ cron scan mỗi ngày + tự chạy tối đa 6 giờ/lần khi có thông báo mới. */
export async function pruneAlerts(): Promise<number> {
  lastPrune = Date.now();
  const now = Date.now();
  const { count } = await prisma.alert.deleteMany({
    where: { OR: Object.entries(KEEP_DAYS).map(([kind, d]) => ({ kind, createdAt: { lt: new Date(now - d * 86400e3) } })) },
  });
  return count;
}

/** HTML Telegram → text thường: dòng đầu = tiêu đề, phần còn lại = nội dung. */
export function htmlToAlert(html: string): { title: string; body: string } {
  const text = html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
  const [first, ...rest] = text.split("\n");
  const title = first.trim();
  // Tiêu đề dài → rút gọn, giữ đủ câu trong body để xem chi tiết
  if (title.length > 160) return { title: `${title.slice(0, 150)}…`, body: text.slice(0, 8000) };
  return { title, body: rest.join("\n").trim().slice(0, 8000) };
}

/** Ghi thông báo web — lỗi DB không được làm hỏng luồng cron/Telegram. */
export async function pushAlert(html: string, a: WebAlert): Promise<void> {
  try {
    const { title, body } = htmlToAlert(html);
    const userId = a.userId === undefined ? await ownerId() : a.userId;
    const row = await prisma.alert.create({ data: { kind: a.kind, level: a.level ?? "info", title, body, ticker: a.ticker ?? null, userId } });
    await fanOut(row, html);
    if (Date.now() - lastPrune > 6 * 3600e3) await pruneAlerts();
  } catch (e) {
    console.error("[alerts] push", e);
  }
}

/**
 * Đẩy thông báo ra ngoài web: Telegram riêng (user khác owner đã liên kết — owner đã nhận
 * qua TELEGRAM_CHAT_ID) + web push mọi thiết bị đã bật. Lọc theo User.alertKinds.
 */
async function fanOut(row: { id: number; kind: string; level: string; title: string; body: string; ticker: string | null; userId: number | null }, html: string) {
  const users = await prisma.user.findMany({
    where: { ...(row.userId === null ? {} : { id: row.userId }), alertKinds: { has: row.kind }, OR: [{ tgChatId: { not: null } }, { pushSubs: { some: {} } }] },
    select: { id: true, owner: true, tgChatId: true, pushSubs: true },
  });
  if (!users.length) return;
  // Tag gom theo loại+mã: tin mới thay tin cũ cùng loại trên máy (báo cáo vị thế 30ph/lần không chất chồng).
  const payload = { title: row.title, body: row.body.slice(0, 1000), url: alertHref(row), tag: `vt-${row.kind}${row.ticker ? `-${row.ticker}` : ""}`, kind: row.kind, level: row.level };
  const jobs: Promise<unknown>[] = [];
  for (const u of users) {
    if (u.tgChatId && !u.owner && process.env.TELEGRAM_BOT_TOKEN)
      jobs.push(
        tgSend(u.tgChatId, html).then(async (r) => {
          // 403 = user chặn bot / rời chat → bỏ liên kết
          if (r.status === 403) await prisma.user.update({ where: { id: u.id }, data: { tgChatId: null } });
        }),
      );
    for (const s of u.pushSubs) jobs.push(sendPush(s, payload));
  }
  await Promise.allSettled(jobs);
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
