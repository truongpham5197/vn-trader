import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchJson } from "@/lib/data/http";
import { NEWS_TYPE, toNewsItem } from "@/lib/data/fundamentals";
import { bad } from "@/lib/api";

export const dynamic = "force-dynamic";

const BASE = "https://api-finfo.vndirect.com.vn/v4";
const TYPES = new Set(Object.keys(NEWS_TYPE)); // dividend | financialstatement | resolutions | meeting | personnel | issue | investor_transaction

interface RawNews {
  newsDate: string;
  newsTitle: string;
  newsUrl?: string;
  dstockUrl?: string;
  newsType: string;
  newsGroup?: string;
  tagCodes?: string;
}

const load = (ticker: string | null, type: string | null) =>
  fetchJson<{ data: RawNews[] }>(
    `${BASE}/news?q=${ticker ? `tagCodes:${ticker}` : ""}${ticker && type ? "~" : ""}${type ? `newsType:${type}` : ""}&size=${ticker ? 30 : 60}&sort=newsDate:desc`,
    1,
  ).then((j) => (j?.data ?? []).map(toNewsItem));

// Tin theo mã/loại — cache 1h; lỗi fetchJson lan ra → 502, mã không có tin → []
const cached = unstable_cache(load, ["news"], { revalidate: 3600 });

/**
 * GET ?ticker=FPT&type=dividend → tin theo mã + loại (mặc định mọi loại).
 * Không truyền ticker → feed toàn thị trường (bắt buộc type).
 * Loại: dividend | financialstatement | resolutions | meeting | personnel | issue | investor_transaction
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const ticker = sp.get("ticker")?.trim().toUpperCase() ?? null;
  const type = sp.get("type")?.trim().toLowerCase() ?? null;
  if (ticker && !/^[A-Z0-9]{3,10}$/.test(ticker)) return bad("Mã không hợp lệ");
  if (type && !TYPES.has(type)) return bad("Loại tin không hợp lệ");
  if (!ticker && !type) return bad("Cần ticker hoặc type");
  const items = await cached(ticker, type).catch(() => null);
  if (!items) return bad("Chưa lấy được tin (nguồn VNDirect lỗi)", 502);
  return NextResponse.json({ news: items });
}
