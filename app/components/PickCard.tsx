"use client";

import Link from "next/link";
import type { SectorPick } from "@/lib/analysis/sector-strength";
import { useQuote } from "./live";
import { FundBadge } from "./Fundamentals";
import OpportunityStatus from "./OpportunityStatus";

// Giá trong DB = nghìn đồng → hiển thị đồng cho người mới (31.4 → 31.400đ)
const dong = (p: number) => `${Math.round(p * 1000).toLocaleString("vi-VN")}đ`;
const tone = (v: number) => (v > 0 ? "text-gain" : v < 0 ? "text-loss" : "text-amber-300");


/** Thẻ gợi ý mua: giá live, vùng mua/cắt lỗ/chốt lời, lý do cụ thể + nhận định kinh doanh. */
export default function PickCard({ p, sector }: { p: SectorPick; sector?: string }) {
  const { ref, quote } = useQuote<HTMLDivElement>(p.ticker);
  const close = quote?.last ?? p.close;
  const base = quote?.ref ?? (p.chgPct !== null ? p.close / (1 + p.chgPct / 100) : null);
  const chg = base ? (close / base - 1) * 100 : null;

  return (
    <div ref={ref} className="card min-w-0 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <Link href={`/stock/${p.ticker}`} className="text-base font-bold hover:text-accent">
          {p.ticker}
        </Link>
        <span className="truncate text-xs text-muted">{p.setup}</span>
      </div>
      {(p.companyName || sector) && <div className="truncate text-xs text-muted">{[sector, p.companyName].filter(Boolean).join(" · ")}</div>}
      <dl className="num mt-2 space-y-0.5 text-xs">
        <div className="flex flex-wrap justify-between gap-x-2">
          <dt className="text-muted">Giá tham khảo {quote?.source === "minute" && <span className="text-accent">⚡</span>}</dt>
          <dd className="font-semibold">
            <span className={chg !== null ? tone(chg) : ""}>{dong(close)}</span>
            {chg !== null && (
              <span className={`ml-1 ${tone(chg)}`}>
                ({chg >= 0 ? "+" : ""}
                {chg.toFixed(1)}%)
              </span>
            )}
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-x-2">
          <dt className="text-muted">Vùng theo dõi</dt>
          <dd className="font-semibold">
            {dong(p.buyZone[0])} – {dong(p.buyZone[1])}
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-x-2">
          <dt className="text-muted">Mốc vô hiệu</dt>
          <dd className="text-loss">
            {dong(p.stop)}
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-x-2">
          <dt className="text-muted">Mục tiêu mô hình</dt>
          <dd className="text-gain">
            {dong(p.target)}
          </dd>
        </div>
      </dl>
      <OpportunityStatus ticker={p.ticker} date={p.dataDate} buyZone={p.buyZone} stop={p.stop} target={p.target} trigger={p.trigger} marketWeak={p.marketWeak} />
      <p className="mt-1 text-[11px] text-muted">Điểm phù hợp điều kiện: {p.score.toFixed(0)} — không phải xác suất thắng.</p>
      <p className="mt-2 text-xs leading-relaxed text-foreground/90">{p.plain}</p>
      <details className="mt-1 text-xs" open>
        <summary className="cursor-pointer text-muted hover:text-foreground">Vì sao gợi ý?</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 leading-relaxed text-muted">
          {p.why.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </details>
      <div className="mt-2 border-t border-border/60 pt-2">
        <FundBadge ticker={p.ticker} />
      </div>
    </div>
  );
}
