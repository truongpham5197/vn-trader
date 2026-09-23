import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchFundamentals, fundamentalVerdict, summarizeFundamentals } from "@/lib/data/fundamentals";
import { bad } from "@/lib/api";

export const dynamic = "force-dynamic";

// BCTC đổi theo quý, tin công bố vài lần/ngày → cache 3h là đủ
// Rỗng hoàn toàn = nguồn lỗi → throw để không cache kết quả rỗng 3h
const cached = unstable_cache(
  async (t: string) => {
    const f = await fetchFundamentals(t);
    if (!f.quarters.length && f.pe === null && !f.news.length) throw new Error(`no data ${t}`);
    return f;
  },
  ["fundamentals"],
  { revalidate: 3 * 3600 },
);

/** GET ?ticker=FPT → chỉ số + KQKD theo quý + diễn giải + tin công bố gần đây. */
export async function GET(req: Request) {
  const ticker = new URL(req.url).searchParams.get("ticker")?.trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9]{3,10}$/.test(ticker)) return bad("Mã không hợp lệ");
  const f = await cached(ticker).catch(() => null);
  if (!f) return bad("Chưa lấy được dữ liệu kinh doanh (nguồn VNDirect lỗi hoặc mã mới niêm yết)", 502);
  const notes = summarizeFundamentals(f);
  return NextResponse.json({ ...f, notes, verdict: fundamentalVerdict(notes) });
}
