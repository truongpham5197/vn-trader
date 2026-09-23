"use client";

import { Button, useApi } from "./ui";
import { BusinessBox, NewsList, useFundamentals } from "./Fundamentals";

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

/** Tình hình kinh doanh + tin công bố (VNDirect finfo). */
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
    </div>
  );
}
