"use client";

import { useEffect, useState } from "react";
import type { FundNote, Fundamentals } from "@/lib/data/fundamentals";

type Data = Fundamentals & { notes: FundNote[]; verdict: FundNote };

const TONE = { good: "text-gain", bad: "text-loss", info: "text-foreground" } as const;
const ICON = { good: "✅", bad: "⚠️", info: "•" } as const;
const ty = (v: number | null) => (v === null ? "—" : Math.round(v / 1e9).toLocaleString("en-US"));

/** Vì sao có tín hiệu: lý do kỹ thuật + tình hình kinh doanh + tin công bố (tải khi mở dòng). */
export default function SignalDetail({ ticker, reason, plan }: { ticker: string; reason: string | null; plan: string | null }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/fundamentals?ticker=${ticker}`)
      .then(async (r) => {
        const j = await r.json();
        if (!live) return;
        if (r.ok) setD(j as Data);
        else setErr(j.error ?? "Lỗi tải dữ liệu");
      })
      .catch(() => live && setErr("Lỗi mạng"));
    return () => {
      live = false;
    };
  }, [ticker]);

  // cùng kỳ năm trước của từng quý (quarters sắp mới → cũ, cách 4 phần tử)
  const qs = d?.quarters.slice(0, 4).map((q, i) => {
    const prev = d.quarters[i + 4];
    const g = prev?.profit && prev.profit > 0 && q.profit !== null ? ((q.profit - prev.profit) / prev.profit) * 100 : null;
    return { ...q, g };
  });

  return (
    <div className="grid gap-4 py-1 text-xs leading-relaxed lg:grid-cols-2">
      <div className="space-y-3">
        <div>
          <div className="mb-1 font-semibold text-foreground">📌 Vì sao có tín hiệu (giá + khối lượng)</div>
          <p className="text-muted">{reason ?? "—"}</p>
          {plan && <p className="mt-1 text-muted">🎯 {plan}</p>}
        </div>
        <div>
          <div className="mb-1 font-semibold text-foreground">📰 Tin 45 ngày gần đây</div>
          {!d && !err && <p className="text-muted">Đang tải…</p>}
          {d && !d.news.length && <p className="text-muted">Không có tin mới.</p>}
          <ul className="space-y-1">
            {d?.news.map((n, i) => (
              <li key={i} className="text-muted">
                <span className="num">{n.date.slice(5).split("-").reverse().join("/")}</span>{" "}
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
      </div>

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
          Nguồn: VNDirect (BCTC hợp nhất, công bố HOSE/HNX, báo chí). Tín hiệu mua dựa trên giá + khối lượng; thông tin kinh doanh để bạn tự đánh giá thêm, không
          phải khuyến nghị.
        </p>
      </div>
    </div>
  );
}
