"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { inVnSession } from "@/lib/vn-time";
import { quoteHalt, type QuoteHalt } from "@/lib/quote-quality";
import type { Quote } from "@/lib/price";

type Listener = () => void;

/**
 * Kho giá live dùng chung toàn app: component nào hiển thị giá thì đăng ký mã
 * (chỉ khi đang hiện trên màn hình), kho gom lại poll /api/quotes —
 * trong phiên 20s/lần, ngoài phiên 5 phút, tab ẩn thì dừng.
 */
class QuoteStore {
  quotes: Record<string, Quote | null> = {};
  at: Date | null = null;
  private refs = new Map<string, number>();
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private busy = false;

  subscribe = (l: Listener) => (this.listeners.add(l), () => void this.listeners.delete(l));
  private emit() {
    for (const l of this.listeners) l();
  }

  watch(ticker: string) {
    this.refs.set(ticker, (this.refs.get(ticker) ?? 0) + 1);
    if (!(ticker in this.quotes)) this.schedule(300);
    return () => {
      const n = (this.refs.get(ticker) ?? 1) - 1;
      if (n) this.refs.set(ticker, n);
      else this.refs.delete(ticker);
    };
  }

  schedule(ms: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.poll(), ms);
  }

  private async poll() {
    const tickers = [...this.refs.keys()];
    if (tickers.length && !document.hidden && !this.busy) {
      this.busy = true;
      try {
        // /api/quotes nhận tối đa 80 mã/lần
        for (let i = 0; i < tickers.length; i += 80) {
          const r = await fetch(`/api/quotes?tickers=${tickers.slice(i, i + 80).join(",")}`);
          if (r.ok) Object.assign(this.quotes, await r.json());
        }
        this.quotes = { ...this.quotes };
        this.at = new Date();
        this.emit();
      } catch {
        /* mạng lỗi → giữ giá cũ, lượt sau thử lại */
      } finally {
        this.busy = false;
      }
    }
    this.schedule(inVnSession() ? 20_000 : 300_000);
  }
}

const Ctx = createContext<QuoteStore | null>(null);

export function QuotesProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => new QuoteStore());
  useEffect(() => {
    const wake = () => !document.hidden && store.schedule(0);
    document.addEventListener("visibilitychange", wake);
    return () => document.removeEventListener("visibilitychange", wake);
  }, [store]);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

function useStore() {
  const store = useContext(Ctx);
  const [, bump] = useState(0);
  useEffect(() => store?.subscribe(() => bump((n) => n + 1)), [store]);
  return store;
}

/** Giá live của 1 mã; chỉ poll khi phần tử `ref` đang hiện trên màn hình (details đóng / cuộn khuất thì thôi). */
export function useQuote<T extends Element>(ticker: string) {
  const store = useStore();
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!store) return;
    if (!el || typeof IntersectionObserver === "undefined") return store.watch(ticker);
    let stop: (() => void) | undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !stop) stop = store.watch(ticker);
      else if (!e.isIntersecting && stop) (stop(), (stop = undefined));
    });
    io.observe(el);
    return () => (io.disconnect(), stop?.());
  }, [store, ticker]);
  return { ref, quote: store?.quotes[ticker] ?? null, at: store?.at ?? null };
}

/** Giá live cho cả danh sách mã (bảng luôn hiện — không cần theo dõi hiển thị). */
export function useQuotes(tickers: string[]) {
  const store = useStore();
  const key = tickers.join(",");
  useEffect(() => {
    if (!store || !key) return;
    const stops = key.split(",").map((t) => store.watch(t));
    return () => stops.forEach((f) => f());
  }, [store, key]);
  return store?.quotes ?? {};
}

/** Lần cập nhật cuối của kho giá (hiện "cập nhật hh:mm:ss"). */
export function useQuotesAt() {
  return useStore()?.at ?? null;
}

/**
 * Ghim theo dõi giá cho cả danh sách mã trong list/bảng — render vô hình, dùng
 * được trong server component. Item trong list vẫn dùng useQuote bình thường;
 * pin giữ mã trong refs nên nội dung list không trễ/nhảy theo cuộn.
 */
export function PinQuotes({ tickers }: { tickers: string[] }) {
  useQuotes(tickers);
  return null;
}

/** Nháy nền xanh/đỏ khi giá đổi. */
function useFlash(v: number | null) {
  const prev = useRef(v);
  const [cls, setCls] = useState("");
  useEffect(() => {
    if (v !== null && prev.current !== null && v !== prev.current) {
      setCls(v > prev.current ? "bg-gain/25" : "bg-loss/25");
      const t = setTimeout(() => setCls(""), 900);
      prev.current = v;
      return () => clearTimeout(t);
    }
    prev.current = v;
  }, [v]);
  return cls;
}

const dong = (p: number) => `${Math.round(p * 1000).toLocaleString("vi-VN")}đ`;

/**
 * Giá + % so tham chiếu, tự cập nhật. `fallback` = giá server render (hiện
 * tới khi có giá live). unit "dong" = 31.400đ, "k" = 31.40.
 */
export function LivePrice({
  ticker,
  fallback = null,
  refPrice = null,
  unit = "k",
  showPct = true,
  className = "",
}: {
  ticker: string;
  fallback?: number | null;
  refPrice?: number | null;
  unit?: "k" | "dong";
  showPct?: boolean;
  className?: string;
}) {
  const { ref, quote } = useQuote<HTMLSpanElement>(ticker);
  const last = quote?.last ?? fallback;
  const base = quote?.ref ?? refPrice;
  const pct = last !== null && base ? (last / base - 1) * 100 : null;
  const flash = useFlash(last);
  const tone = pct === null ? "" : pct > 0 ? "text-gain" : pct < 0 ? "text-loss" : "text-amber-300";
  return (
    <span ref={ref} className={`num rounded px-0.5 whitespace-nowrap transition-colors duration-700 ${flash} ${className}`}>
      <span className={tone}>{last === null ? "—" : unit === "dong" ? dong(last) : last.toFixed(2)}</span>
      {showPct && pct !== null && (
        <span className={`ml-1 ${tone}`}>
          ({pct >= 0 ? "+" : ""}
          {pct.toFixed(2)}%)
        </span>
      )}
    </span>
  );
}

/** "⚡ Giá tự cập nhật 20s · lần cuối 10:31:05" */
export function LiveBadge({ className = "" }: { className?: string }) {
  const at = useQuotesAt();
  const [clock, setClock] = useState<{ session: boolean; halt: QuoteHalt | null } | null>(null);
  const tick = useCallback(() => setClock({ session: inVnSession(), halt: quoteHalt() }), []);
  useEffect(() => {
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [tick]);
  if (!clock) return null;
  const label = !clock.session
    ? "Ngoài giờ giao dịch — giá cập nhật 5 phút/lần"
    : clock.halt === "lunch"
      ? "Nghỉ trưa — giá khớp cuối buổi sáng"
      : clock.halt === "atc"
        ? "Sắp đóng cửa — giá khớp cuối, không còn khớp liên tục"
        : "⚡ Giá tự cập nhật mỗi 20 giây";
  return (
    <span className={`text-xs text-muted ${className}`}>
      <span className={clock.session && !clock.halt ? "text-accent" : ""}>{label}</span>
      {at && ` · lần cuối ${at.toLocaleTimeString("vi-VN")}`}
    </span>
  );
}
