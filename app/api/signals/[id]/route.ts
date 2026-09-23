import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NEED_USER, ONLY_OWNER, currentUser } from "@/lib/user";
import { bad, body, pos } from "@/lib/api";
import { takeSignal } from "@/lib/trades";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// action: take (đã mua → mở vị thế) | skip (bỏ qua) | reset (về chờ xử lý)
export async function PATCH(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const sig = await prisma.signal.findUnique({ where: { id } });
  if (!sig) return bad("Không tìm thấy tín hiệu", 404);
  const b = await body<{ action: string; qty: string; entry: string }>(req);
  const u = await currentUser();
  if (!u) return bad(NEED_USER, 401);

  if (b.action === "take") {
    const qty = b.qty ? pos(b.qty) : sig.qty;
    const entry = b.entry ? pos(b.entry) : sig.entry;
    if (!qty || !Number.isInteger(qty))
      return bad("Số lượng phải là số nguyên dương");
    if (!entry) return bad("Giá mua không hợp lệ");
    const trade = await takeSignal(id, { qty, entry, userId: u.id });
    return NextResponse.json({ ok: true, tradeId: trade.id });
  }
  // Trạng thái tín hiệu dùng chung (Telegram owner) → chỉ owner đổi/xóa
  if (!u.owner) return bad(ONLY_OWNER, 403);
  if (b.action === "skip" || b.action === "reset") {
    await prisma.signal.update({
      where: { id },
      data: { status: b.action === "skip" ? "skipped" : "notified" },
    });
    return NextResponse.json({ ok: true });
  }
  return bad("Hành động không hợp lệ");
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  if (!(await currentUser())?.owner) return bad(ONLY_OWNER, 403);
  if (!(await prisma.signal.findUnique({ where: { id } })))
    return bad("Không tìm thấy tín hiệu", 404);
  // Trade/Order giữ lại, chỉ bỏ liên kết
  await prisma.$transaction([
    prisma.trade.updateMany({
      where: { signalId: id },
      data: { signalId: null },
    }),
    prisma.order.updateMany({
      where: { signalId: id },
      data: { signalId: null },
    }),
    prisma.signal.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}
