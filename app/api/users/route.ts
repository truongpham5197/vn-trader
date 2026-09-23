import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bad, body } from "@/lib/api";
import { USER_COOKIE, cleanUsername, findByName } from "@/lib/user";

export const dynamic = "force-dynamic";

const withCookie = (res: NextResponse, id: number | null) => {
  if (id)
    res.cookies.set(USER_COOKIE, String(id), {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 365 * 86400,
    });
  else res.cookies.delete(USER_COOKIE);
  return res;
};

export async function GET() {
  const users = await prisma.user.findMany({
    orderBy: { username: "asc" },
    select: {
      username: true,
      owner: true,
      _count: { select: { trades: { where: { status: "open" } } } },
    },
  });
  return NextResponse.json(
    users.map((u) => ({
      username: u.username,
      owner: u.owner,
      open: u._count.trades,
    })),
  );
}

// {username, create:true} tạo tên mới (không trùng, không phân biệt hoa thường); không có create = chọn tên có sẵn
export async function POST(req: Request) {
  const b = await body<{ username: string; create: boolean }>(req);
  const username = cleanUsername(b.username);
  if (!username) return bad("Tên 2–30 ký tự: chữ, số, khoảng trắng, _ . -");
  const found = await findByName(username);
  if (b.create) {
    if (found)
      return bad(
        `Tên "${found.username}" đã có người dùng — chọn tên khác hoặc chọn từ danh sách`,
      );
    const u = await prisma.user.create({ data: { username } });
    return withCookie(
      NextResponse.json({ ok: true, username: u.username }),
      u.id,
    );
  }
  if (!found) return bad(`Chưa có người dùng "${username}"`, 404);
  return withCookie(
    NextResponse.json({ ok: true, username: found.username }),
    found.id,
  );
}

// Thoát (xóa cookie)
export async function DELETE() {
  return withCookie(NextResponse.json({ ok: true }), null);
}
