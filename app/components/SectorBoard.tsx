"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { SectorRow } from "@/lib/report/sectors";
import { LiveBadge, useQuotes } from "./live";

const KIND_LABEL: Record<string, string> = {
  cash: "cổ tức tiền",
  split: "chia tách/thưởng",
};

export default function SectorBoard({ rows }: { rows: SectorRow[] }) {
  const quotes = useQuotes(useMemo(() => rows.map((r) => r.ticker), [rows]));

  const groups = useMemo(() => {
    const m = new Map<string, SectorRow[]>();
    for (const r of rows) {
      const list = m.get(r.sector);
      if (list) list.push(r);
      else m.set(r.sector, [r]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "vi"));
  }, [rows]);

  if (!rows.length) {
    return <p className="card p-4 text-muted">Chưa có mã nào đang theo dõi.</p>;
  }

  const livePct = (r: SectorRow): number | null => {
    const last = quotes[r.ticker]?.last ?? null;
    const ref = quotes[r.ticker]?.ref ?? r.ref;
    return last !== null && ref ? (last / ref - 1) * 100 : null;
  };

  return (
    <div>
      <div className="mb-3 text-xs text-muted">
        Giá gần realtime — nến 1 phút DNSE (trễ ~1 phút). <LiveBadge />
      </div>
      {groups.map(([sector, list]) => {
        const pcts = list.map(livePct).filter((v): v is number => v !== null);
        const avg = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
        return (
          <section key={sector} className="mb-5">
            <h2 className="mb-2 font-semibold">
              {sector} <span className="text-muted">· {list.length} mã</span>
              {avg !== null && (
                <span className={`num ml-2 ${avg >= 0 ? "text-gain" : "text-loss"}`}>
                  {avg >= 0 ? "+" : ""}
                  {avg.toFixed(2)}%
                </span>
              )}
            </h2>
            <div className="card overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <th className="p-3 font-medium">Mã</th>
                    <th className="p-3 text-right font-medium">Giá</th>
                    <th className="p-3 text-right font-medium">%</th>
                    <th className="p-3 text-right font-medium">TC</th>
                    <th className="p-3 font-medium">Kế hoạch</th>
                    <th className="p-3 font-medium">Lý do / sự kiện</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => {
                    const q = quotes[r.ticker];
                    const last = q?.last ?? null;
                    const ref = q?.ref ?? r.ref;
                    const pct = last !== null && ref ? (last / ref - 1) * 100 : null;
                    const up = (pct ?? 0) >= 0;
                    return (
                      <tr
                        key={r.ticker}
                        className="border-b border-border/50 align-top last:border-0 hover:bg-white/[0.03]"
                      >
                        <td className="p-3">
                          <Link href={`/stock/${r.ticker}`} className="font-semibold hover:text-accent">
                            {r.ticker}
                          </Link>
                          {r.held && (
                            <span className="ml-1.5 rounded border border-accent/40 bg-accent/10 px-1 py-0.5 text-xs text-accent">
                              giữ
                            </span>
                          )}
                          {r.companyName && (
                            <div className="mt-0.5 max-w-36 truncate text-muted">
                              {r.companyName}
                            </div>
                          )}
                        </td>
                        <td
                          className={`num p-3 text-right font-semibold ${
                            last === null ? "text-muted" : up ? "text-gain" : "text-loss"
                          }`}
                        >
                          {last !== null ? last.toFixed(2) : "—"}
                        </td>
                        <td
                          className={`num p-3 text-right ${
                            pct === null ? "text-muted" : up ? "text-gain" : "text-loss"
                          }`}
                        >
                          {pct !== null ? `${up ? "+" : ""}${pct.toFixed(2)}%` : "—"}
                        </td>
                        <td className="num p-3 text-right text-muted">
                          {ref !== null ? ref.toFixed(2) : "—"}
                        </td>
                        <td className="p-3">
                          {r.label && <div className="text-muted">{r.label}</div>}
                          <div className="num mt-0.5">
                            {r.buyLow !== null && r.buyHigh !== null
                              ? `vùng ${r.buyLow.toFixed(2)}–${r.buyHigh.toFixed(2)}`
                              : r.entry !== null
                                ? `vào ${r.entry.toFixed(2)}`
                                : ""}
                            {r.stop !== null && (
                              <span className="text-loss"> · SL {r.stop.toFixed(2)}</span>
                            )}
                            {r.target !== null && (
                              <span className="text-gain"> · TP {r.target.toFixed(2)}</span>
                            )}
                          </div>
                        </td>
                        <td className="max-w-72 p-3">
                          {r.reason && <div className="text-muted">{r.reason}</div>}
                          {r.plan && (
                            <div className="mt-0.5 text-muted/70 italic">{r.plan}</div>
                          )}
                          {r.corp && (
                            <div className="num mt-1 text-accent">
                              📋 GDKHQ {r.corp.exDate.slice(5).split("-").reverse().join("/")} ·{" "}
                              {KIND_LABEL[r.corp.kind] ?? r.corp.kind} ×{r.corp.factor.toFixed(4)}
                              {r.corp.before !== null && r.corp.after !== null && (
                                <span>
                                  {" "}
                                  · {r.corp.before.toFixed(2)} → {r.corp.after.toFixed(2)}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
