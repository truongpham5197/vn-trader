"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Hit {
  ticker: string;
  companyName: string | null;
  exchange: string;
  sector: string | null;
}

/** Ô tìm mã trên thanh menu — gõ mã hoặc tên công ty, Enter / chọn → /stock/MÃ. Phím "/" để focus. */
export default function StockSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (!term) return setHits([]);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/symbols?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((h: Hit[]) => (setHits(h), setSel(0)))
        .catch(() => {});
    }, 150);
    return () => (clearTimeout(t), ctl.abort());
  }, [q]);

  const go = (ticker: string) => {
    setQ("");
    setHits([]);
    setOpen(false);
    input.current?.blur();
    router.push(`/stock/${ticker}`);
  };

  return (
    <div className="relative ml-auto w-36 shrink-0 sm:w-56">
      <input
        ref={input}
        value={q}
        onChange={(e) => (setQ(e.target.value), setOpen(true))}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(s + 1, hits.length - 1)));
          else if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)));
          else if (e.key === "Escape") input.current?.blur();
          else if (e.key === "Enter") {
            const t = hits[sel]?.ticker ?? q.trim().toUpperCase();
            if (/^[A-Z0-9]{3,10}$/.test(t)) go(t);
          }
        }}
        placeholder="🔍 Tìm mã / tên công ty"
        aria-label="Tìm mã cổ phiếu"
        className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs outline-none placeholder:text-muted focus:border-accent"
      />
      {open && hits.length > 0 && (
        <ul className="absolute right-0 z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-card shadow-xl">
          {hits.map((h, i) => (
            <li key={h.ticker}>
              <button
                type="button"
                onMouseDown={(e) => (e.preventDefault(), go(h.ticker))}
                onMouseEnter={() => setSel(i)}
                className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-xs ${i === sel ? "bg-accent/15" : ""}`}
              >
                <b className="w-12 shrink-0">{h.ticker}</b>
                <span className="min-w-0 flex-1 truncate text-muted">{h.companyName ?? h.sector ?? ""}</span>
                <span className="shrink-0 text-[10px] text-muted">{h.exchange}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
