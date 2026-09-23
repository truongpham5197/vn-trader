import webpush from "web-push";
import { prisma } from "./prisma";

type Vapid = { publicKey: string; privateKey: string };
let vapid: Vapid | undefined;

/** Khóa VAPID lưu ở Setting "vapidKeys" — tự sinh lần đầu, không cần env trên Vercel. */
export async function vapidKeys(): Promise<Vapid> {
  if (vapid) return vapid;
  const row = await prisma.setting.findUnique({ where: { key: "vapidKeys" } });
  if (row) return (vapid = JSON.parse(row.value) as Vapid);
  const keys = webpush.generateVAPIDKeys();
  // 2 request cùng sinh → giữ bản ghi đầu tiên
  await prisma.setting.createMany({ data: [{ key: "vapidKeys", value: JSON.stringify(keys) }], skipDuplicates: true });
  const saved = await prisma.setting.findUniqueOrThrow({ where: { key: "vapidKeys" } });
  return (vapid = JSON.parse(saved.value) as Vapid);
}

/** force: hiện cả khi web đang mở (gửi thử) — bình thường sw.js bỏ qua vì trang đã có toast. */
export type PushPayload = { title: string; body: string; url: string; tag: string; force?: boolean };

/** Gửi 1 thông báo đẩy; subscription hết hạn (404/410) → xóa. Trả mã HTTP của dịch vụ push (0 = lỗi mạng). */
export async function sendPush(sub: { id: number; endpoint: string; p256dh: string; auth: string }, payload: PushPayload): Promise<number> {
  const { publicKey, privateKey } = await vapidKeys();
  try {
    const r = await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
      TTL: 3600,
      timeout: 5000,
      vapidDetails: { subject: "https://vn-trader.vercel.app", publicKey, privateKey },
    });
    return r.statusCode;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode ?? 0;
    if (code === 404 || code === 410) await prisma.pushSub.delete({ where: { id: sub.id } }).catch(() => {});
    else console.error("[push]", code, (e as Error).message);
    return code;
  }
}
