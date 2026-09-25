"use client";

import { useEffect, useState } from "react";
import { Button, useApi } from "./ui";
import { BusinessBox, NewsList, useFundamentals } from "./Fundamentals";
import { vnToday } from "@/lib/vn-time";
import { dmy } from "@/lib/format";
import { eventDetail, type CorpEvent } from "@/lib/data/events";

/** Thêm/bỏ mã khỏi danh sách theo dõi (scan luôn quét mã này). */
export function WatchButton({
  ticker,
  watched,
}: {
  ticker: string;
  watched: boolean;
}) {
  const { call, busy } = useApi();
  return (
    <Button
      size="sm"
      tone={watched ? "ghost" : "primary"}
      disabled={busy}
      onClick={() =>
        call(
          watched ? "DELETE" : "POST",
          "/api/watchlist",
          { ticker },
          watched ? `Đã bỏ theo dõi ${ticker}` : `Đã theo dõi ${ticker}`,
        )
      }
    >
      {watched ? "★ Đang theo dõi" : "☆ Theo dõi"}
    </Button>
  );
}

/** Sự kiện sắp tới + vừa qua của 1 mã (VNDirect events — GDKHQ, cổ tức, ĐHCĐ). */
export function StockEvents({ ticker }: { ticker: string }) {
  const [events, setEvents] = useState<CorpEvent[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/events?ticker=${ticker}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Lỗi");
        return j as { events: CorpEvent[] };
      })
      .then((j) => live && setEvents(j.events))
      .catch(() => live && setEvents([]));
    return () => void (live = false);
  }, [ticker]);
  if (events === null) return <p className="text-muted">Đang tải sự kiện…</p>;
  if (!events.length)
    return <p className="text-muted">Chưa có sự kiện nào được công bố.</p>;
  const today = vnToday();
  const upcoming = events
    .filter((e) => e.exDate !== null && e.exDate >= today)
    .sort((a, b) => a.exDate!.localeCompare(b.exDate!))
    .slice(0, 6);
  const past = events
    .filter((e) => e.exDate === null || e.exDate < today)
    .sort((a, b) => (b.exDate ?? b.announced ?? "").localeCompare(a.exDate ?? a.announced ?? ""))
    .slice(0, Math.max(0, 8 - upcoming.length));
  const rows = [...upcoming.map((e) => ({ e, next: true })), ...past.map((e) => ({ e, next: false }))];
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-border text-left text-muted">
          <th className="py-1 pr-3 font-medium">Ngày GDKHQ/họp</th>
          <th className="pr-3 font-medium">Sự kiện</th>
          <th className="pr-3 font-medium">Chi tiết</th>
          <th className="font-medium">Ngày trả</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ e, next }, i) => (
          <tr key={i} className={`border-b border-border/40 last:border-0 ${next ? "" : "text-muted"}`}>
            <td className="num whitespace-nowrap py-1 pr-3">
              {dmy(e.exDate)}
              {e.exDate === today && <span className="ml-1 text-amber-300">hôm nay</span>}
            </td>
            <td className="whitespace-nowrap py-1 pr-3">
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px]">{e.label}</span>
            </td>
            <td className="py-1 pr-3">{eventDetail(e) || "—"}</td>
            <td className="num whitespace-nowrap py-1 text-muted">{e.group === "dividend" ? dmy(e.payDate) : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Tình hình kinh doanh + tin công bố + sự kiện (VNDirect finfo). */
export function StockFundamentals({ ticker }: { ticker: string }) {
  const { d, err } = useFundamentals(ticker);
  return (
    <div className="grid gap-4 text-xs leading-relaxed lg:grid-cols-2">
      <div className="card p-3">
        <BusinessBox d={d} err={err} />
      </div>
      <div className="card p-3">
        <NewsList ticker={ticker} d={d} err={err} />
      </div>
      <div className="card overflow-x-auto p-3 lg:col-span-2">
        <div className="mb-1 font-semibold text-foreground">📅 Sự kiện</div>
        <StockEvents ticker={ticker} />
      </div>
    </div>
  );
}
