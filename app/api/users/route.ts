import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bad, body } from "@/lib/api";
import { NEED_USER, USER_COOKIE, cleanUsername, currentUser, findByName, sessionCookie } from "@/lib/user";
import { PIN_LOCK_MS, PIN_MAX_FAILS, checkPin, hashPin, validPin } from "@/lib/pin";

export const dynamic = "force-dynamic";

const withCookie = async (res: NextResponse, u: { id: number; sessionVer: number } | null) => {
  if (u)
    res.cookies.set(USER_COOKIE, await sessionCookie(u), {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 365 * 86400,
    });
  else res.cookies.delete(USER_COOKIE);
  return res;
};

const PIN_ERR = "Mã PIN phải đúng 6 chữ số";

/** Ghi 1 lần sai (tăng nguyên tử — chống thử song song); đủ 5 lần → khóa 15 phút. */
async function failPin(id: number) {
  const { pinFails } = await prisma.user.update({ where: { id }, data: { pinFails: { increment: 1 } } });
  if (pinFails < PIN_MAX_FAILS) return bad(`Sai mã PIN (còn ${PIN_MAX_FAILS - pinFails} lần thử)`, 403);
  await prisma.user.update({ where: { id }, data: { pinFails: 0, pinLockUntil: new Date(Date.now() + PIN_LOCK_MS) } });
  return bad("Sai mã PIN 5 lần — khóa 15 phút", 429);
}

export async function GET() {
  const users = await prisma.user.findMany({
    orderBy: { username: "asc" },
    select: {
      username: true,
      owner: true,
      pinHash: true,
      _count: { select: { trades: { where: { status: "open" } } } },
    },
  });
  return NextResponse.json(
    users.map((u) => ({
      username: u.username,
      owner: u.owner,
      hasPin: !!u.pinHash,
      open: u._count.trades,
    })),
  );
}

/**
 * {username, pin, create?}: create = tạo tên mới kèm PIN; không create = vào tên có sẵn —
 * đã có PIN thì kiểm tra (sai 5 lần khóa 15 phút), chưa có thì PIN gửi lên thành PIN của tên đó.
 * Thành công → cookie có chữ ký 1 năm, thiết bị này không hỏi lại.
 */
export async function POST(req: Request) {
  const b = await body<{ username: string; create: boolean; pin: string }>(req);
  const username = cleanUsername(b.username);
  if (!username) return bad("Tên 2–30 ký tự: chữ, số, khoảng trắng, _ . -");
  if (!validPin(b.pin)) return bad(PIN_ERR);
  const found = await findByName(username);
  if (b.create) {
    if (found)
      return bad(
        `Tên "${found.username}" đã có người dùng — chọn tên khác hoặc chọn từ danh sách`,
      );
    const u = await prisma.user.create({ data: { username, pinHash: hashPin(b.pin) } });
    return withCookie(NextResponse.json({ ok: true, username: u.username }), u);
  }
  if (!found) return bad(`Chưa có người dùng "${username}"`, 404);
  if (!found.pinHash) {
    // chỉ đặt khi vẫn chưa có PIN — 2 máy cùng đặt thì máy sau phải nhập PIN của máy trước
    const { count } = await prisma.user.updateMany({
      where: { id: found.id, pinHash: null },
      data: { pinHash: hashPin(b.pin), pinFails: 0, pinLockUntil: null },
    });
    if (!count) return bad("Tên này vừa được đặt PIN — mở lại và nhập PIN", 409);
    return withCookie(NextResponse.json({ ok: true, username: found.username, created: true }), found);
  }
  if (found.pinLockUntil && found.pinLockUntil > new Date()) {
    const min = Math.ceil((found.pinLockUntil.getTime() - Date.now()) / 60_000);
    return bad(`Nhập sai quá nhiều — thử lại sau ${min} phút`, 429);
  }
  if (!checkPin(b.pin, found.pinHash)) return failPin(found.id);
  if (found.pinFails || found.pinLockUntil)
    await prisma.user.update({ where: { id: found.id }, data: { pinFails: 0, pinLockUntil: null } });
  return withCookie(NextResponse.json({ ok: true, username: found.username }), found);
}

/** Đổi PIN {pin, newPin} — đăng xuất mọi thiết bị khác (tăng sessionVer), thiết bị này giữ phiên. */
export async function PATCH(req: Request) {
  const me = await currentUser();
  if (!me) return bad(NEED_USER, 401);
  const b = await body<{ pin: string; newPin: string }>(req);
  if (!validPin(b.pin) || !validPin(b.newPin)) return bad(PIN_ERR);
  const u = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  if (u.pinLockUntil && u.pinLockUntil > new Date()) return bad("Đang bị khóa do nhập sai — thử lại sau", 429);
  if (!checkPin(b.pin, u.pinHash)) return failPin(u.id);
  const next = await prisma.user.update({
    where: { id: u.id },
    data: { pinHash: hashPin(b.newPin), pinFails: 0, pinLockUntil: null, sessionVer: { increment: 1 } },
  });
  return withCookie(NextResponse.json({ ok: true }), next);
}

// Thoát (xóa cookie)
export async function DELETE() {
  return withCookie(NextResponse.json({ ok: true }), null);
}
