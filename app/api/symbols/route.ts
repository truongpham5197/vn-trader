import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ~1.600 mã, đổi hiếm → cache 1h rồi lọc trong bộ nhớ
const all = unstable_cache(
  () =>
    prisma.symbol.findMany({
      where: { active: true },
      select: { ticker: true, companyName: true, exchange: true, sector: true },
      orderBy: { ticker: "asc" },
    }),
  ["symbols-all"],
  { revalidate: 3600 },
);

// Bỏ dấu tiếng Việt để gõ "hoa phat" vẫn ra "Hòa Phát"
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** GET ?q=hpg | "hoa phat" → tối đa 8 mã: khớp mã trước, rồi tên công ty. */
export async function GET(req: Request) {
  const q = fold((new URL(req.url).searchParams.get("q") ?? "").trim()).slice(0, 40);
  if (!q) return NextResponse.json([]);
  const rank = (s: { ticker: string; companyName: string | null }) => {
    const t = s.ticker.toLowerCase();
    if (t === q) return 0;
    if (t.startsWith(q)) return 1;
    if (s.companyName && fold(s.companyName).includes(q)) return 2;
    return 9;
  };
  const hits = (await all())
    .map((s) => ({ s, r: rank(s) }))
    .filter((x) => x.r < 9)
    .sort((a, b) => a.r - b.r || a.s.ticker.length - b.s.ticker.length || a.s.ticker.localeCompare(b.s.ticker))
    .slice(0, 8)
    .map((x) => x.s);
  return NextResponse.json(hits);
}
