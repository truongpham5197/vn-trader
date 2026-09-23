"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface Hit {
  ticker: string;
  companyName: string | null;
  exchange: string;
  sector: string | null;
}

/** Gợi ý mã theo chuỗi gõ (mã hoặc tên công ty, ≤8) — debounce 150ms. */
export function useSymbolHits(q: string) {
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);
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
  /** ↑/↓ chọn, Enter → onPick(mã đang chọn). Trả true nếu đã xử lý phím. */
  const onKey = (e: React.KeyboardEvent, onPick: (h: Hit) => void) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(s + 1, hits.length - 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)));
    else if (e.key === "Enter" && hits[sel]) (e.preventDefault(), onPick(hits[sel]));
    else return false;
    return true;
  };
  return { hits, setHits, sel, setSel, onKey };
}

/** Danh sách gợi ý thả xuống dưới ô nhập (cha phải `relative`). */
export function SymbolHits({
  hits,
  sel,
  setSel,
  onPick,
  className = "right-0 w-72",
}: {
  hits: Hit[];
  sel: number;
  setSel: (i: number) => void;
  onPick: (h: Hit) => void;
  className?: string;
}) {
  if (!hits.length) return null;
  return (
    <ul className={`absolute z-50 mt-1 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-card shadow-xl ${className}`}>
      {hits.map((h, i) => (
        <li key={h.ticker}>
          <button
            type="button"
            onMouseDown={(e) => (e.preventDefault(), onPick(h))}
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
  );
}

/** Ô tìm mã trên thanh menu — gõ mã hoặc tên công ty, Enter / chọn → /stock/MÃ. Phím "/" để focus. */
export default function StockSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { hits, setHits, sel, setSel, onKey } = useSymbolHits(q);
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
          if (onKey(e, (h) => go(h.ticker))) return;
          if (e.key === "Escape") input.current?.blur();
          else if (e.key === "Enter") {
            const t = q.trim().toUpperCase();
            if (/^[A-Z0-9]{3,10}$/.test(t)) go(t);
          }
        }}
        placeholder="🔍 Tìm mã / tên công ty"
        aria-label="Tìm mã cổ phiếu"
        className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs outline-none placeholder:text-muted focus:border-accent"
      />
      {open && <SymbolHits hits={hits} sel={sel} setSel={setSel} onPick={(h) => go(h.ticker)} />}
    </div>
  );
}
