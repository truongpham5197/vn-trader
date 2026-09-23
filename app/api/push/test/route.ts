import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPush } from "@/lib/push";
import { NEED_USER, currentUser } from "@/lib/user";
import { bad } from "@/lib/api";

export const dynamic = "force-dynamic";

// POST → gửi thử 1 thông báo đẩy tới mọi thiết bị đã bật của user hiện tại
export async function POST() {
  const u = await currentUser();
  if (!u) return bad(NEED_USER, 401);
  const subs = await prisma.pushSub.findMany({ where: { userId: u.id } });
  if (!subs.length) return bad("Chưa có thiết bị nào bật thông báo đẩy — bấm Bật trước");
  const codes = await Promise.all(
    subs.map((s) =>
      sendPush(s, {
        title: "🔔 VN Trader — gửi thử",
        body: `Thông báo đẩy của ${u.username} đang hoạt động trên thiết bị này.`,
        url: "/settings#thong-bao",
        tag: "vt-test",
        force: true,
      }),
    ),
  );
  const ok = codes.filter((c) => c >= 200 && c < 300).length;
  return NextResponse.json({ ok, total: subs.length, gone: codes.filter((c) => c === 404 || c === 410).length });
}
