"use client";

import { assessOpportunity, type OpportunityAssessment } from "../../lib/analysis/opportunity";
import { quoteFresh, signalExpired } from "../../lib/quote-quality";
import { useQuote } from "./live";

export function OpportunityText({ assessment: a, trigger, date }: {
  assessment: OpportunityAssessment; trigger?: string; date?: string;
}) {
  const tone = a.actionable ? "text-gain" : ["invalid", "expired"].includes(a.state) ? "text-loss" : "text-amber-300";
  return (
    <div className="mt-2 space-y-1 text-xs leading-relaxed" data-opportunity-state={a.state}>
      <p className={`font-semibold ${tone}`}>{a.label}</p>
      <p className="text-muted">{a.detail}</p>
      {trigger && <p><span className="text-muted">Điều kiện cần: </span>{trigger}</p>}
      {a.netRR !== null && <p className="text-muted">R:R sau phí tại giá đang xét: <b className="num">{a.netRR.toFixed(2)}</b> — không phải xác suất thắng.</p>}
      {date && <p className="text-muted">Nến nguồn: <span className="num">{date}</span> · chưa kiểm chứng lợi nhuận</p>}
    </div>
  );
}

export default function OpportunityStatus({ ticker, date, latestSession, confirmed = false, buyZone, stop, target, trigger, marketWeak }: {
  ticker: string; date?: string; latestSession?: string | null; confirmed?: boolean;
  buyZone: [number, number] | null; stop: number; target: number; trigger?: string; marketWeak?: boolean;
}) {
  const { ref, quote } = useQuote<HTMLDivElement>(ticker);
  const now = new Date();
  const assessment = assessOpportunity({ confirmed, price: quote?.last ?? null, stop, target, buyZone, marketWeak,
    fresh: quoteFresh(quote, now, latestSession ?? date), expired: !!date && signalExpired(date, latestSession, now) });
  return (
    <div ref={ref}>
      {confirmed && <p className="mt-1 text-xs text-muted">Đã xác nhận điều kiện kỹ thuật khi đóng nến; chưa phải quyết định mua.</p>}
      <OpportunityText assessment={assessment} trigger={trigger} date={date} />
      <p className="mt-1 text-[11px] text-muted">
        {quote?.source === "minute" && quote.asOf ? `Giá nến 1 phút: ${new Date(quote.asOf).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} (${quote.date})`
          : quote?.source === "daily" ? `Giá dự phòng nến ngày ${quote.date} — không phải realtime` : "Chưa có nguồn giá mới"}
      </p>
    </div>
  );
}
