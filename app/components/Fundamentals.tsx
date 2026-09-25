"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { FundNote, Fundamentals, NewsItem } from "@/lib/data/fundamentals";

export type FundData = Fundamentals & { notes: FundNote[]; verdict: FundNote };

const TONE = { good: "text-gain", bad: "text-loss", info: "text-foreground" } as const;
const ICON = { good: "✅", bad: "⚠️", info: "•" } as const;
const ty = (v: number | null) => (v === null ? "—" : Math.round(v / 1e9).toLocaleString("en-US"));

// Nhiều thẻ cùng mã trên 1 trang → dùng chung 1 request
const inflight = new Map<string, Promise<FundData>>();
const load = (ticker: string) => {
  let p = inflight.get(ticker);
  if (!p) {
    p = fetch(`/api/fundamentals?ticker=${ticker}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Lỗi tải dữ liệu");
      return j as FundData;
    });
    p.catch(() => inflight.delete(ticker));
    inflight.set(ticker, p);
  }
  return p;
};

/** Tải dữ liệu kinh doanh; `lazy` = chỉ tải khi phần tử `ref` hiện trên màn hình. */
export function useFundamentals<T extends Element>(ticker: string, lazy = false) {
  const ref = useRef<T>(null);
  const [d, setD] = useState<FundData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const run = () =>
      load(ticker).then(
        (x) => live && setD(x),
        (e: Error) => live && setErr(e.message === "Failed to fetch" ? "Lỗi mạng" : e.message),
      );
    const el = ref.current;
    if (!lazy || !el || typeof IntersectionObserver === "undefined") {
      void run();
      return () => void (live = false);
    }
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (io.disconnect(), void run()));
    io.observe(el);
    return () => ((live = false), io.disconnect());
  }, [ticker, lazy]);
  return { ref, d, err };
}

/** 1 dòng nhận định kinh doanh (tải khi hiện ra) — dùng trên thẻ gợi ý. */
export function FundBadge({ ticker }: { ticker: string }) {
  const { ref, d, err } = useFundamentals<HTMLDivElement>(ticker, true);
  return (
    <div ref={ref} className="text-xs">
      {d ? (
        <span className={TONE[d.verdict.tone]}>
          🏢 {d.verdict.text}
          {d.notes[0] && <span className="text-muted"> · {d.notes[0].text}</span>}
        </span>
      ) : (
        <span className="text-muted">🏢 {err ? "Chưa có dữ liệu kinh doanh" : "Đang tải tình hình kinh doanh…"}</span>
      )}{" "}
      <Link href={`/stock/${ticker}`} className="whitespace-nowrap text-accent hover:underline">
        Chi tiết →
      </Link>
    </div>
  );
}

// Chip lọc loại tin — "Tất cả" dùng sẵn tin 45 ngày từ fundamentals, loại riêng
// gọi /api/news (lịch sử sâu hơn — cổ tức mấy năm mới có đủ)
const NEWS_CHIPS: [string | null, string][] = [
  [null, "Tất cả"],
  ["dividend", "Cổ tức"],
  ["financialstatement", "BCTC"],
  ["meeting", "ĐHCĐ"],
  ["issue", "Phát hành"],
  ["investor_transaction", "GD nội bộ"],
];

export function NewsList({ ticker, d, err }: { ticker: string; d: FundData | null; err: string | null }) {
  const [type, setType] = useState<string | null>(null);
  // Kết quả gắn key mã:loại — đổi chip thì data cũ tự lệch key → hiện "Đang tải"
  const [res, setRes] = useState<{ key: string; news?: NewsItem[]; error?: string } | null>(null);
  useEffect(() => {
    if (type === null) return;
    const key = `${ticker}:${type}`;
    let live = true;
    fetch(`/api/news?ticker=${ticker}&type=${type}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Lỗi tải tin");
        return j as { news: NewsItem[] };
      })
      .then((j) => live && setRes({ key, news: j.news }))
      .catch((e: Error) => live && setRes({ key, error: e.message === "Failed to fetch" ? "Lỗi mạng" : e.message }));
    return () => void (live = false);
  }, [ticker, type]);
  const filtered = type !== null;
  const busy = filtered && res?.key !== `${ticker}:${type}`;
  const newsErr = filtered && !busy ? (res?.error ?? null) : null;
  const news = filtered ? (busy ? [] : (res?.news ?? [])) : (d?.news ?? []);
  return (
    <div>
      <div className="mb-1 font-semibold text-foreground">📰 Tin tức{filtered ? "" : " 45 ngày gần đây"}</div>
      <div className="mb-2 flex flex-wrap gap-1">
        {NEWS_CHIPS.map(([v, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => setType(v)}
            className={`rounded-md border px-2 py-0.5 text-[11px] ${
              type === v ? "border-accent/60 bg-accent/15 text-foreground" : "border-border text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {!filtered && !d && !err && <p className="text-muted">Đang tải…</p>}
      {filtered && busy && <p className="text-muted">Đang tải…</p>}
      {filtered && newsErr && <p className="text-loss">{newsErr}</p>}
      {!busy && !newsErr && !news.length && (filtered || d) && <p className="text-muted">Không có tin.</p>}
      <ul className="space-y-1">
        {news.map((n, i) => (
          <li key={i} className="text-muted">
            <span className="num">
              {n.date.slice(5).split("-").reverse().join("/")}
              {filtered && <span className="text-[10px]">/{n.date.slice(0, 4)}</span>}
            </span>{" "}
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px]">{n.type}</span>{" "}
            {n.url ? (
              <a href={n.url} target="_blank" rel="noreferrer" className="text-foreground hover:text-accent hover:underline">
                {n.title.startsWith(`${ticker}:`) ? n.title.slice(ticker.length + 1).trim() : n.title}
              </a>
            ) : (
              n.title
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BusinessBox({ d, err }: { d: FundData | null; err: string | null }) {
  // cùng kỳ năm trước của từng quý (quarters sắp mới → cũ, cách 4 phần tử)
  const qs = d?.quarters.slice(0, 4).map((q, i) => {
    const prev = d.quarters[i + 4];
    const g = prev?.profit && prev.profit > 0 && q.profit !== null ? ((q.profit - prev.profit) / prev.profit) * 100 : null;
    return { ...q, g };
  });
  return (
    <div>
      <div className="mb-1 font-semibold text-foreground">🏢 Tình hình kinh doanh</div>
      {err && <p className="text-loss">{err}</p>}
      {!d && !err && <p className="text-muted">Đang tải…</p>}
      {d && (
        <>
          <div className={`mb-2 font-medium ${TONE[d.verdict.tone]}`}>
            {ICON[d.verdict.tone]} {d.verdict.text}
          </div>
          <ul className="mb-3 space-y-0.5">
            {d.notes.map((n, i) => (
              <li key={i} className={TONE[n.tone]}>
                {ICON[n.tone]} {n.text}
              </li>
            ))}
          </ul>
          {qs && qs.length > 0 && (
            <table className="w-full max-w-md border-collapse">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="py-1 text-left font-medium">Quý</th>
                  <th className="py-1 text-right font-medium">{d.isBank ? "Thu nhập" : "Doanh thu"} (tỷ)</th>
                  <th className="py-1 text-right font-medium">Lợi nhuận (tỷ)</th>
                  <th className="py-1 text-right font-medium">LN so cùng kỳ</th>
                </tr>
              </thead>
              <tbody>
                {qs.map((q) => (
                  <tr key={q.fiscalDate} className="border-b border-border/40 last:border-0">
                    <td className="py-1">{q.period}</td>
                    <td className="num py-1 text-right">{ty(q.revenue)}</td>
                    <td className={`num py-1 text-right ${(q.profit ?? 0) < 0 ? "text-loss" : ""}`}>{ty(q.profit)}</td>
                    <td className={`num py-1 text-right ${q.g === null ? "text-muted" : q.g >= 0 ? "text-gain" : "text-loss"}`}>
                      {q.g === null ? "—" : `${q.g >= 0 ? "+" : ""}${q.g.toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      <p className="mt-3 text-[11px] text-muted">
        Nguồn: VNDirect (BCTC hợp nhất, công bố HOSE/HNX, báo chí). Tín hiệu mua dựa trên giá + khối lượng; thông tin kinh doanh để bạn tự đánh
        giá thêm, không phải khuyến nghị.
      </p>
    </div>
  );
}
