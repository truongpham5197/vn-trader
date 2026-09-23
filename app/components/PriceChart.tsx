"use client";

import { useState } from "react";

export interface PricePoint {
  date: string;
  close: number;
}

const W = 600;
const H = 140;
const dong = (p: number) => `${Math.round(p * 1000).toLocaleString("vi-VN")}đ`;
const vnDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
};
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Vị trí ngón tay/chuột (0–1 theo bề ngang) → phiên gần nhất. */
export function chartIndex(ratio: number, n: number): number {
  if (n <= 1) return 0;
  const r = Math.min(1, Math.max(0, ratio));
  return Math.round(r * (n - 1));
}

/** Giá đóng cửa + TB20. Rê chuột, hoặc chạm và kéo trên điện thoại, để xem giá đúng ngày. */
export default function PriceChart({ points }: { points: PricePoint[] }) {
  const [idx, setIdx] = useState<number | null>(null);
  const n = points.length;
  if (n < 2) return null;
  const ma = points.map((_, i) => (i >= 19 ? avg(points.slice(i - 19, i + 1).map((p) => p.close)) : null));
  const all = [...points.map((p) => p.close), ...ma.filter((v): v is number => v !== null)];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 8);
  const line = (vs: (number | null)[]) =>
    vs.map((v, i) => (v === null ? "" : `${vs[i - 1] == null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join("");
  const up = points[n - 1].close >= points[0].close;
  const hit = idx === null ? null : points[idx];
  const prev = hit && idx !== null && idx > 0 ? points[idx - 1].close : null;
  const pct = hit && prev ? (hit.close / prev - 1) * 100 : null;
  const maHit = idx === null ? null : ma[idx];

  function track(e: React.PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return;
    setIdx(chartIndex((e.clientX - box.left) / box.width, n));
  }

  return (
    <div>
      <p className="mb-1 min-h-5 text-xs leading-snug">
        {hit ? (
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="num text-muted">{vnDate(hit.date)}</span>
            <span className={`num font-semibold ${pct === null ? "" : pct >= 0 ? "text-gain" : "text-loss"}`}>{dong(hit.close)}</span>
            {pct !== null && (
              <span className={`num ${pct >= 0 ? "text-gain" : "text-loss"}`}>
                {pct >= 0 ? "+" : ""}
                {pct.toFixed(2)}% so phiên trước
              </span>
            )}
            {maHit !== null && <span className="num text-muted">TB20 {dong(maHit)}</span>}
          </span>
        ) : (
          <span className="text-muted">Rê chuột, hoặc chạm và kéo, để xem giá từng ngày</span>
        )}
      </p>
      <div
        className="relative touch-pan-y select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          track(e);
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" || e.currentTarget.hasPointerCapture(e.pointerId)) track(e);
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          if (e.pointerType === "mouse") {
            const box = e.currentTarget.getBoundingClientRect();
            const inside = e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
            if (!inside) setIdx(null);
          }
        }}
        onPointerCancel={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse" && !e.currentTarget.hasPointerCapture(e.pointerId)) setIdx(null);
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="pointer-events-none h-40 w-full sm:h-36"
          preserveAspectRatio="none"
          role="img"
          aria-label="Biểu đồ giá. Rê chuột hoặc chạm và kéo để xem giá theo ngày."
        >
          <path d={line(ma)} fill="none" stroke="currentColor" className="text-muted" strokeWidth="1.2" strokeDasharray="4 3" />
          <path d={line(points.map((p) => p.close))} fill="none" stroke="currentColor" className={up ? "text-gain" : "text-loss"} strokeWidth="1.8" />
        </svg>
        {idx !== null && hit && (
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute top-0 bottom-0 w-px bg-foreground/50" style={{ left: `${(idx / (n - 1)) * 100}%` }} />
            <div
              className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background ${pct !== null && pct < 0 ? "bg-loss" : "bg-gain"}`}
              style={{ left: `${(idx / (n - 1)) * 100}%`, top: `${(y(hit.close) / H) * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
