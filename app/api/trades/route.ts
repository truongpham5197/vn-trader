import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bad, body, pos } from "@/lib/api";
import { sendTelegram } from "@/lib/telegram/notify";
import { px } from "@/lib/format";

export const dynamic = "force-dynamic";

// Thêm vị thế mua tay (giống /add Telegram) — watcher canh stop/target
export async function POST(req: Request) {
  const b = await body<{ ticker: string; qty: string; entry: string; stop: string; target: string; note: string }>(req);
  const ticker = String(b.ticker ?? "").trim().toUpperCase();
  const qty = pos(b.qty);
  const entry = pos(b.entry);
  const stop = b.stop ? pos(b.stop) : null;
  const target = b.target ? pos(b.target) : null;
  if (!qty || !Number.isInteger(qty)) return bad("Số lượng phải là số nguyên dương");
  if (!entry) return bad("Giá vốn không hợp lệ");
  if ((b.stop && !stop) || (b.target && !target)) return bad("Giá cắt lỗ/chốt lời không hợp lệ");
  if (stop && target && stop >= target) return bad("Cắt lỗ phải thấp hơn chốt lời");
  const sym = await prisma.symbol.findUnique({ where: { ticker } });
  if (!sym) return bad(`Không tìm thấy mã ${ticker}`);

  const trade = await prisma.trade.create({
    data: {
      symbolId: sym.id,
      qty,
      entryPrice: entry,
      stopPrice: stop,
      targetPrice: target,
      note: String(b.note ?? "").trim() || "manual-add",
    },
  });
  await sendTelegram(
    `✅ (web) Mở vị thế #${trade.id}: <b>${ticker}</b> ${qty.toLocaleString("en-US")}cp @ ${px(entry)} · SL ${px(stop)} · TP ${px(target)}`,
  ).catch(() => false);
  return NextResponse.json({ ok: true, id: trade.id });
}
