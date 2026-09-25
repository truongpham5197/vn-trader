import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchEvents } from "@/lib/data/events";
import { bad } from "@/lib/api";

export const dynamic = "force-dynamic";

// Sự kiện doanh nghiệp đổi vài lần/ngày — cache 30 phút
const cached = unstable_cache(async (t: string | null) => fetchEvents(t ?? undefined), ["events"], {
  revalidate: 30 * 60,
});

/** GET → sự kiện toàn thị trường · ?ticker=FPT → chỉ mã đó. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("ticker")?.trim().toUpperCase() ?? null;
  if (raw && !/^[A-Z0-9]{3,10}$/.test(raw)) return bad("Mã không hợp lệ");
  const events = await cached(raw).catch(() => null);
  if (!events) return bad("Chưa lấy được dữ liệu sự kiện (nguồn VNDirect lỗi)", 502);
  return NextResponse.json({ events });
}
