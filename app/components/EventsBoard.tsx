"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { vnToday } from "@/lib/vn-time";
import { dmy } from "@/lib/format";
import { eventDetail, type CorpEvent, type EventGroup } from "@/lib/data/events";
import type { NewsItem } from "@/lib/data/fundamentals";
import { SymbolHits, useSymbolHits } from "./StockSearch";

const GROUPS: [EventGroup | null, string][] = [
  [null, "Tất cả"],
  ["dividend", "Cổ tức"],
  ["meeting", "ĐHCĐ"],
  ["issue", "Phát hành/NY"],
  ["trade", "Chế tài GD"],
];

const GROUP_CLS: Record<EventGroup, string> = {
  dividend: "text-gain",
  meeting: "text-accent",
  issue: "text-amber-300",
  trade: "text-loss",
};

function EventRows({ events, upcoming }: { events: CorpEvent[]; upcoming: boolean }) {
  const today = vnToday();
  return (
    <tbody>
      {events.map((e, i) => (
        <tr key={i} className="border-t border-border/60 align-top">
          <td className="num whitespace-nowrap py-1.5 pr-3">
            {upcoming ? dmy(e.exDate) : dmy(e.announced)}
            {e.exDate === today && upcoming && <span className="ml-1 text-amber-300">hôm nay</span>}
          </td>
          <td className="py-1.5 pr-3 font-semibold">
            <Link href={`/stock/${e.ticker}`} className="hover:text-accent">
              {e.ticker}
            </Link>
          </td>
          <td className="whitespace-nowrap py-1.5 pr-3">
            <span className={`rounded bg-white/5 px-1.5 py-0.5 text-[10px] ${GROUP_CLS[e.group]}`}>{e.label}</span>
          </td>
          <td className="min-w-56 py-1.5 pr-3 text-muted">{eventDetail(e) || "—"}</td>
          <td className="num whitespace-nowrap py-1.5 text-muted">
            {upcoming ? (e.payDate && e.group === "dividend" ? `trả ${dmy(e.payDate)}` : "") : e.exDate ? `GDKHQ ${dmy(e.exDate)}` : ""}
          </td>
        </tr>
      ))}
    </tbody>
  );
}

/**
 * Bảng sự kiện doanh nghiệp toàn thị trường / theo mã — VNDirect events.
 * Lọc mã → gọi /api/events?ticker= (lịch sử sâu hơn); trống → feed chung.
 */
// Kết quả fetch gắn với tham số (key) — đổi mã lọc thì data cũ tự lệch key
// → hiện "Đang tải" thay vì nhấp nháy data của mã trước
type Fetched<T> = { key: string; data?: T; error?: string };

export default function EventsBoard() {
  const [ev, setEv] = useState<Fetched<CorpEvent[]> | null>(null);
  const [group, setGroup] = useState<EventGroup | null>(null);
  const [q, setQ] = useState("");
  const [ticker, setTicker] = useState("");
  const [open, setOpen] = useState(false);
  const { hits, setHits, sel, setSel, onKey } = useSymbolHits(q);
  const [news, setNews] = useState<Fetched<NewsItem[]> | null>(null);

  // Sự kiện: đổi mã → fetch riêng theo mã (sâu lịch sử), trống → feed chung
  useEffect(() => {
    let live = true;
    fetch(`/api/events${ticker ? `?ticker=${ticker}` : ""}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Lỗi tải sự kiện");
        return j as { events: CorpEvent[] };
      })
      .then((j) => live && setEv({ key: ticker, data: j.events }))
      .catch((e: Error) => live && setEv({ key: ticker, error: e.message === "Failed to fetch" ? "Lỗi mạng" : e.message }));
    return () => void (live = false);
  }, [ticker]);

  // Tin cổ tức: theo mã đang lọc, trống → toàn thị trường
  useEffect(() => {
    let live = true;
    fetch(`/api/news?type=dividend${ticker ? `&ticker=${ticker}` : ""}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Lỗi");
        return j as { news: NewsItem[] };
      })
      .then((j) => live && setNews({ key: ticker, data: j.news }))
      .catch(() => live && setNews({ key: ticker, data: [] }));
    return () => void (live = false);
  }, [ticker]);

  const events = ev?.key === ticker ? (ev.data ?? null) : null;
  const err = ev?.key === ticker ? (ev.error ?? null) : null;
  const divNews = news?.key === ticker ? (news.data ?? null) : null;

  const today = vnToday();
  const filtered = useMemo(
    () => (events ?? []).filter((e) => group === null || e.group === group),
    [events, group],
  );
  // Sắp diễn ra: exDate ≥ hôm nay, gần nhất trước — nhóm tin công bố không có exDate
  // rõ (chế tài GD…) vẫn nằm ở bảng "thông báo gần đây"
  const upcoming = filtered
    .filter((e) => e.exDate !== null && e.exDate >= today)
    .sort((a, b) => a.exDate!.localeCompare(b.exDate!) || a.ticker.localeCompare(b.ticker))
    .slice(0, 100);
  const recent = filtered
    .filter((e) => !e.exDate || e.exDate < today)
    .sort((a, b) => (b.announced ?? "").localeCompare(a.announced ?? "") || (b.exDate ?? "").localeCompare(a.exDate ?? ""))
    .slice(0, 100);

  const pick = (t: string) => {
    setTicker(t);
    setQ("");
    setHits([]);
    setOpen(false);
  };

  return (
    <section className="card overflow-x-auto p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">📅 Sự kiện doanh nghiệp</h2>
        <div className="relative ml-auto w-44">
          <input
            value={q}
            onChange={(e) => (setQ(e.target.value), setOpen(true))}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (onKey(e, (h) => pick(h.ticker))) return;
              if (e.key === "Enter") {
                const t = q.trim().toUpperCase();
                if (/^[A-Z0-9]{3,10}$/.test(t)) pick(t);
              }
            }}
            placeholder="Lọc theo mã…"
            aria-label="Lọc sự kiện theo mã"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1 text-xs outline-none placeholder:text-muted focus:border-accent"
          />
          {open && <SymbolHits hits={hits} sel={sel} setSel={setSel} onPick={(h) => pick(h.ticker)} className="left-0 w-64" />}
        </div>
        {ticker && (
          <button
            type="button"
            onClick={() => setTicker("")}
            className="rounded-md border border-accent/60 bg-accent/15 px-2 py-1 text-xs"
            title="Bỏ lọc mã"
          >
            {ticker} ✕
          </button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-1">
        {GROUPS.map(([v, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => setGroup(v)}
            className={`rounded-md border px-2 py-0.5 text-[11px] ${
              group === v ? "border-accent/60 bg-accent/15 text-foreground" : "border-border text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {err && <p className="text-loss">{err}</p>}
      {!events && !err && <p className="text-muted">Đang tải…</p>}
      {events && (
        <>
          <h3 className="mb-1 text-xs font-semibold text-muted">Sắp diễn ra ({upcoming.length})</h3>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-1 pr-3 font-medium">{upcoming.length ? "Ngày GDKHQ/họp" : "Ngày"}</th>
                <th className="pr-3 font-medium">Mã</th>
                <th className="pr-3 font-medium">Sự kiện</th>
                <th className="pr-3 font-medium">Chi tiết</th>
                <th className="font-medium">Ngày trả</th>
              </tr>
            </thead>
            <EventRows events={upcoming} upcoming />
          </table>
          {!upcoming.length && <p className="py-2 text-muted">Không có sự kiện sắp tới{ticker ? ` của ${ticker}` : ""}.</p>}

          <h3 className="mt-4 mb-1 text-xs font-semibold text-muted">Thông báo gần đây ({recent.length})</h3>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-1 pr-3 font-medium">Công bố</th>
                <th className="pr-3 font-medium">Mã</th>
                <th className="pr-3 font-medium">Sự kiện</th>
                <th className="pr-3 font-medium">Chi tiết</th>
                <th className="font-medium">GDKHQ</th>
              </tr>
            </thead>
            <EventRows events={recent} upcoming={false} />
          </table>
          {!recent.length && <p className="py-2 text-muted">Chưa có thông báo.</p>}

          <h3 className="mt-4 mb-1 text-xs font-semibold text-muted">💰 Tin cổ tức{ticker ? ` — ${ticker}` : " mới nhất"}</h3>
          {!divNews && <p className="text-muted">Đang tải…</p>}
          {divNews && !divNews.length && <p className="text-muted">Không có tin cổ tức.</p>}
          <ul className="space-y-1 text-xs">
            {(divNews ?? []).map((n, i) => (
              <li key={i} className="text-muted">
                <span className="num">{dmy(n.date)}</span>{" "}
                {n.ticker && (
                  <Link href={`/stock/${n.ticker}`} className="font-semibold text-foreground hover:text-accent">
                    {n.ticker}
                  </Link>
                )}{" "}
                {n.url ? (
                  <a href={n.url} target="_blank" rel="noreferrer" className="text-foreground hover:text-accent hover:underline">
                    {n.ticker && n.title.startsWith(`${n.ticker}:`) ? n.title.slice(n.ticker.length + 1).trim() : n.title}
                  </a>
                ) : (
                  n.title
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 text-[11px] text-muted">
        Nguồn: VNDirect tổng hợp công bố HOSE/HNX/UPCOM. Ngày GDKHQ = ngày giao dịch không hưởng quyền — mua từ ngày
        đó sẽ không được cổ tức/quyền; muốn nhận phải mua chậm nhất phiên trước.
      </p>
    </section>
  );
}
