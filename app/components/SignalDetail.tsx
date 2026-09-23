"use client";

import Link from "next/link";
import { BusinessBox, NewsList, useFundamentals } from "./Fundamentals";

/** Vì sao có tín hiệu: lý do kỹ thuật + tình hình kinh doanh + tin công bố (tải khi mở dòng). */
export default function SignalDetail({ ticker, reason, plan }: { ticker: string; reason: string | null; plan: string | null }) {
  const { d, err } = useFundamentals(ticker);
  return (
    <div className="grid gap-4 py-1 text-xs leading-relaxed lg:grid-cols-2">
      <div className="space-y-3">
        <div>
          <div className="mb-1 font-semibold text-foreground">📌 Vì sao có tín hiệu (giá + khối lượng)</div>
          <p className="text-muted">{reason ?? "—"}</p>
          {plan && <p className="mt-1 text-muted">🎯 {plan}</p>}
          <Link href={`/stock/${ticker}`} className="mt-1 inline-block text-accent hover:underline">
            Xem trang {ticker} →
          </Link>
        </div>
        <NewsList ticker={ticker} d={d} err={err} />
      </div>
      <BusinessBox d={d} err={err} />
    </div>
  );
}
