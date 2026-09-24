"use client";

import { assessOpportunity, type OpportunityAssessment } from "../../lib/analysis/opportunity";
import { quoteFresh, quoteHalt, quoteNote, signalExpired } from "../../lib/quote-quality";
import { useQuote } from "./live";
import { More } from "./More";
import { useVoice } from "./VoiceProvider";
import type { ReactNode } from "react";

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

const toneOf = (a: OpportunityAssessment) =>
  a.actionable ? "text-gain" : ["invalid", "expired"].includes(a.state) ? "text-loss" : "text-amber-300";

/** Nhãn quyết định hiện luôn; giải thích, R:R, nguồn giá nằm sau "Xem thêm". */
export default function OpportunityStatus({ ticker, date, latestSession, confirmed = false, buyZone, stop, target, trigger, marketWeak, extra }: {
  ticker: string; date?: string; latestSession?: string | null; confirmed?: boolean;
  buyZone: [number, number] | null; stop: number; target: number; trigger?: string; marketWeak?: boolean;
  extra?: ReactNode;
}) {
  const { ref, quote } = useQuote<HTMLDivElement>(ticker);
  const { style } = useVoice();
  const now = new Date();
  const fresh = quoteFresh(quote, now, latestSession ?? date);
  const halt = quoteHalt(now);
  const assessment = assessOpportunity({ confirmed, price: quote?.last ?? null, stop, target, buyZone, marketWeak,
    fresh, expired: !!date && signalExpired(date, latestSession, now) });
  const prefix = halt && fresh ? (halt === "lunch" ? "Nghỉ trưa · " : "Sắp đóng cửa · ") : "";
  return (
    <div ref={ref} className="mt-1">
      <p className={`text-xs font-medium ${toneOf(assessment)}`}>{prefix}{style.opp(assessment.state, assessment.label)}</p>
      <More label={style.heads.more}>
        {extra}
        {confirmed && <p className="text-xs text-muted">Đã xác nhận điều kiện kỹ thuật khi đóng nến; chưa phải quyết định mua.</p>}
        <OpportunityText assessment={assessment} trigger={trigger} date={date} />
        <p className="text-[11px] text-muted">{quoteNote(quote, now)}</p>
      </More>
    </div>
  );
}
