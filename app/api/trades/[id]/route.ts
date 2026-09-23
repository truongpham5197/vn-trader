import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NEED_USER, currentUser } from "@/lib/user";
import { bad, body, pos } from "@/lib/api";
import { closeTrade, netPnl } from "@/lib/trades";
import { sendTelegram } from "@/lib/telegram/notify";
import { px } from "@/lib/format";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
type Patch = {
  qty: string;
  entry: string;
  stop: string;
  target: string;
  exit: string;
  note: string;
  close: boolean;
};

// Sửa vị thế (SL, giá vốn, cắt lỗ, chốt lời, giá bán, ghi chú) hoặc đóng lệnh ({close:true, exit})
export async function PATCH(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const [t, u] = await Promise.all([
    prisma.trade.findUnique({ where: { id }, include: { symbol: true } }),
    currentUser(),
  ]);
  if (!u) return bad(NEED_USER, 401);
  if (!t || t.userId !== u.id) return bad("Không tìm thấy lệnh", 404);
  const b = await body<Patch>(req);

  if (b.close) {
    const exit = pos(b.exit);
    if (!exit) return bad("Giá bán không hợp lệ");
    const r = await closeTrade(id, exit);
    if (!r) return bad("Lệnh đã đóng trước đó");
    if (u.owner)
      await sendTelegram(
        `🔒 (web) Đóng <b>${t.symbol.ticker}</b> @ ${px(exit)} — P&amp;L net ${r.pnl >= 0 ? "+" : ""}${(r.pnl / 1e6).toFixed(2)}tr (${r.pnlPct >= 0 ? "+" : ""}${r.pnlPct.toFixed(2)}%)`,
      ).catch(() => false);
    return NextResponse.json({ ok: true });
  }

  // undefined = không đổi, "" = xóa giá trị (chỉ với field tùy chọn)
  const opt = (v: string | undefined, cur: number | null) =>
    v === undefined ? cur : v === "" ? null : pos(v);
  const qty = b.qty === undefined ? t.qty : pos(b.qty);
  const entry = b.entry === undefined ? t.entryPrice : pos(b.entry);
  const stop = opt(b.stop, t.stopPrice);
  const target = opt(b.target, t.targetPrice);
  const exit =
    t.status === "closed"
      ? b.exit === undefined
        ? t.exitPrice
        : pos(b.exit)
      : null;
  if (!qty || !Number.isInteger(qty))
    return bad("Số lượng phải là số nguyên dương");
  if (!entry) return bad("Giá vốn không hợp lệ");
  if (
    (b.stop && !stop) ||
    (b.target && !target) ||
    (t.status === "closed" && !exit)
  )
    return bad("Giá không hợp lệ");
  if (stop && target && stop >= target)
    return bad("Cắt lỗ phải thấp hơn chốt lời");

  await prisma.trade.update({
    where: { id },
    data: {
      qty,
      entryPrice: entry,
      stopPrice: stop,
      targetPrice: target,
      ...(b.note !== undefined && { note: String(b.note).trim() || null }),
      // Lệnh đã đóng: sửa giá/SL thì tính lại P&L
      ...(t.status === "closed" &&
        exit && { exitPrice: exit, pnl: netPnl(entry, exit, qty) }),
    },
  });
  return NextResponse.json({ ok: true });
}

// Xóa lệnh nhập nhầm — Order liên quan chỉ bỏ liên kết
export async function DELETE(_req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const [t, u] = await Promise.all([
    prisma.trade.findUnique({ where: { id }, include: { symbol: true } }),
    currentUser(),
  ]);
  if (!u) return bad(NEED_USER, 401);
  if (!t || t.userId !== u.id) return bad("Không tìm thấy lệnh", 404);
  await prisma.$transaction([
    prisma.order.updateMany({
      where: { tradeId: id },
      data: { tradeId: null },
    }),
    prisma.trade.delete({ where: { id } }),
  ]);
  if (t.status === "open" && u.owner) {
    await sendTelegram(
      `🗑 (web) Xóa vị thế #${id} <b>${t.symbol.ticker}</b> — watcher ngừng canh`,
    ).catch(() => false);
  }
  return NextResponse.json({ ok: true });
}
