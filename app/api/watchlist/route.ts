import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bad, body } from "@/lib/api";
import { getWatchlist, setWatchlist } from "@/lib/trades";

export const dynamic = "force-dynamic";

// Nhận 1 hoặc nhiều mã cách nhau bởi dấu phẩy/khoảng trắng
const parse = (v: unknown) => String(v ?? "").toUpperCase().split(/[\s,;]+/).filter(Boolean);

export async function POST(req: Request) {
  const tickers = parse((await body<{ ticker: string }>(req)).ticker);
  if (!tickers.length) return bad("Nhập mã cổ phiếu");
  const found = await prisma.symbol.findMany({ where: { ticker: { in: tickers } }, select: { ticker: true } });
  const missing = tickers.filter((t) => !found.some((f) => f.ticker === t));
  if (missing.length) return bad(`Không tìm thấy mã: ${missing.join(", ")}`);
  await setWatchlist([...(await getWatchlist()), ...tickers]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const drop = new Set(parse((await body<{ ticker: string }>(req)).ticker));
  await setWatchlist((await getWatchlist()).filter((t) => !drop.has(t)));
  return NextResponse.json({ ok: true });
}
