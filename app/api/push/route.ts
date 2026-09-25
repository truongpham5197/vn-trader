import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { vapidKeys } from "@/lib/push";
import { NEED_USER, currentUser } from "@/lib/user";
import { bad, body } from "@/lib/api";

export const dynamic = "force-dynamic";

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };
const b64 = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_\-=+/]{8,200}$/.test(v);

// GET → khóa công khai VAPID để trình duyệt đăng ký nhận thông báo đẩy
export async function GET() {
  return NextResponse.json({ publicKey: (await vapidKeys()).publicKey });
}

// POST subscription của trình duyệt (PushSubscription.toJSON()) → gắn với user hiện tại.
// sync:true = resync tự động khi mở web — không hồi sinh khi user đã tắt đẩy (pushEnabled=false).
// POST thường (nút Bật) → mở lại pushEnabled.
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return bad(NEED_USER, 401);
  const s = await body<Sub & { sync?: boolean }>(req);
  if (typeof s.endpoint !== "string" || !/^https:\/\/\S{10,1000}$/.test(s.endpoint) || !b64(s.keys?.p256dh) || !b64(s.keys?.auth))
    return bad("Subscription không hợp lệ");
  if (s.sync) {
    if (!u.pushEnabled) return NextResponse.json({ ok: true, skipped: true });
  } else if (!u.pushEnabled) {
    await prisma.user.update({ where: { id: u.id }, data: { pushEnabled: true } });
  }
  const data = { p256dh: s.keys!.p256dh, auth: s.keys!.auth, userId: u.id };
  await prisma.pushSub.upsert({ where: { endpoint: s.endpoint }, update: data, create: { endpoint: s.endpoint, ...data } });
  return NextResponse.json({ ok: true });
}

// DELETE {endpoint} = gỡ 1 thiết bị · {all:true} = tắt đẩy của tài khoản — xóa sub mọi thiết bị (web lẫn PWA điện thoại)
export async function DELETE(req: Request) {
  const d = await body<{ endpoint?: string; all?: boolean }>(req);
  if (d.all) {
    const u = await currentUser();
    if (!u) return bad(NEED_USER, 401);
    await prisma.user.update({ where: { id: u.id }, data: { pushEnabled: false } });
    await prisma.pushSub.deleteMany({ where: { userId: u.id } });
    return NextResponse.json({ ok: true });
  }
  if (typeof d.endpoint !== "string") return bad("Thiếu endpoint");
  await prisma.pushSub.deleteMany({ where: { endpoint: d.endpoint } });
  return NextResponse.json({ ok: true });
}
