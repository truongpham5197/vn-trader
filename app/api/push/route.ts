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

// POST subscription của trình duyệt (PushSubscription.toJSON()) → gắn với user hiện tại
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return bad(NEED_USER, 401);
  const s = await body<Sub>(req);
  if (typeof s.endpoint !== "string" || !/^https:\/\/\S{10,1000}$/.test(s.endpoint) || !b64(s.keys?.p256dh) || !b64(s.keys?.auth))
    return bad("Subscription không hợp lệ");
  const data = { p256dh: s.keys!.p256dh, auth: s.keys!.auth, userId: u.id };
  await prisma.pushSub.upsert({ where: { endpoint: s.endpoint }, update: data, create: { endpoint: s.endpoint, ...data } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { endpoint } = await body<{ endpoint: string }>(req);
  if (typeof endpoint !== "string") return bad("Thiếu endpoint");
  await prisma.pushSub.deleteMany({ where: { endpoint } });
  return NextResponse.json({ ok: true });
}
