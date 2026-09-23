import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NEED_USER, currentUser } from "@/lib/user";
import { bad, body } from "@/lib/api";
import { setWatchlist } from "@/lib/trades";

export const dynamic = "force-dynamic";

// Nhận 1 hoặc nhiều mã cách nhau bởi dấu phẩy/khoảng trắng
const parse = (v: unknown) =>
  String(v ?? "")
    .toUpperCase()
    .split(/[\s,;]+/)
    .filter(Boolean);

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return bad(NEED_USER, 401);
  const tickers = parse((await body<{ ticker: string }>(req)).ticker);
  if (!tickers.length) return bad("Nhập mã cổ phiếu");
  const found = await prisma.symbol.findMany({
    where: { ticker: { in: tickers } },
    select: { ticker: true },
  });
  const missing = tickers.filter((t) => !found.some((f) => f.ticker === t));
  if (missing.length) return bad(`Không tìm thấy mã: ${missing.join(", ")}`);
  await setWatchlist(u.id, [...u.watchlist, ...tickers]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return bad(NEED_USER, 401);
  const drop = new Set(parse((await body<{ ticker: string }>(req)).ticker));
  await setWatchlist(
    u.id,
    u.watchlist.filter((t) => !drop.has(t)),
  );
  return NextResponse.json({ ok: true });
}
