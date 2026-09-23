"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ALERT_KINDS, alertHref as href, type AlertItem, type AlertKind } from "@/lib/alert-kinds";
import { vnNow } from "@/lib/vn-time";
import { Modal } from "./ui";
import { resyncPush } from "./PushSettings";

// ---- Cài đặt riêng trình duyệt này (localStorage) ----
type Prefs = { kinds: Record<AlertKind, boolean> };
const PREFS_KEY = "vt_alert_prefs";
const DEFAULT: Prefs = {
  kinds: { signal: true, sector: true, stop: true, target: true, positions: false, system: true },
};

function readPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
    return { kinds: { ...DEFAULT.kinds, ...p?.kinds } };
  } catch {
    return DEFAULT;
  }
}

function usePrefs() {
  const [prefs, setPrefs] = useState(DEFAULT);
  useEffect(() => {
    const sync = () => setPrefs(readPrefs());
    sync();
    window.addEventListener("vt-alert-prefs", sync);
    return () => window.removeEventListener("vt-alert-prefs", sync);
  }, []);
  const save = (p: Prefs) => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch {}
    window.dispatchEvent(new Event("vt-alert-prefs"));
  };
  return [prefs, save] as const;
}

const seenKey = (u: string) => `vt_alert_seen:${u}`;
const getSeen = (u: string) => {
  try {
    const v = localStorage.getItem(seenKey(u));
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
};
const setSeen = (u: string, id: number) => {
  try {
    localStorage.setItem(seenKey(u), String(id));
  } catch {}
};

/**
 * Nhịp hỏi thông báo theo lịch cron: trong phiên (watcher mỗi phút) 30s,
 * 15h–17h30 (eod-sync + scan ra tín hiệu) 60s, còn lại 5 phút.
 */
function pollMs(): number {
  const n = vnNow();
  const m = n.getHours() * 60 + n.getMinutes();
  if (n.getDay() < 1 || n.getDay() > 5) return 300_000;
  if (m >= 9 * 60 && m < 15 * 60) return 30_000;
  if (m >= 15 * 60 && m < 17 * 60 + 30) return 60_000;
  return 300_000;
}

const TONE: Record<AlertItem["level"], string> = {
  danger: "border-loss/60 text-loss",
  warn: "border-amber-400/60 text-amber-300",
  success: "border-gain/60 text-gain",
  info: "border-accent/50 text-accent",
};
const time = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
const day = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
/** Thời gian toast tự đóng — cảnh báo quan trọng giữ lâu hơn. */
const ttl = (a: AlertItem) => (a.level === "danger" || a.level === "warn" ? 30_000 : 12_000);

/** Chuông thông báo trên menu + thông báo nổi góc phải dưới. */
export default function AlertCenter({ username }: { username: string | null }) {
  const user = username ?? "";
  const [prefs] = usePrefs();
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const [items, setItems] = useState<AlertItem[]>([]);
  const [seen, setSeenState] = useState<number>(0);
  const [toasts, setToasts] = useState<(AlertItem & { until: number })[]>([]);
  const hover = useRef(false);
  const [open, setOpen] = useState(false);
  const bell = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [detail, setDetail] = useState<AlertItem | null>(null);
  const maxId = useRef(0);

  // Tab ẩn / web đóng thì thông báo đẩy (service worker) lo — ở đây chỉ nổi trong trang
  const pop = useCallback((fresh: AlertItem[]) => {
    const show = fresh.filter((a) => prefsRef.current.kinds[a.kind] !== false).slice(0, 5);
    if (!show.length) return;
    const now = Date.now();
    setToasts((xs) => [...show.reverse().map((a) => ({ ...a, until: now + ttl(a) })), ...xs].slice(0, 5));
  }, []);

  useEffect(() => void resyncPush(user), [user]);

  useEffect(() => {
    setMounted(true);
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async (first: boolean) => {
      try {
        const r = await fetch(`/api/alerts${first ? "" : `?after=${maxId.current}`}`);
        if (r.ok) {
          const fresh = (await r.json()) as AlertItem[];
          if (fresh.length) {
            maxId.current = Math.max(maxId.current, fresh[0].id);
            setItems((xs) => [...fresh, ...xs.filter((x) => !fresh.some((f) => f.id === x.id))].slice(0, 30));
          }
          const last = getSeen(user);
          if (first && last === null) {
            // lần đầu mở trên trình duyệt này — không bắn lại thông báo cũ
            setSeen(user, maxId.current);
            setSeenState(maxId.current);
          } else {
            setSeenState(last ?? 0);
            // chỉ nổi thông báo trong 12 giờ gần đây chưa xem
            const since = Date.now() - 12 * 3600e3;
            pop(fresh.filter((a) => a.id > (last ?? 0) && new Date(a.at).getTime() > since));
          }
        }
      } catch {
        /* mạng lỗi → lượt sau */
      }
      if (!stop) timer = setTimeout(() => void tick(false), pollMs());
    };
    void tick(true);
    return () => ((stop = true), clearTimeout(timer));
  }, [user, pop]);

  // Đếm giờ tự đóng; rê chuột / chạm vào thì tạm dừng (dời hạn thêm 1s mỗi nhịp)
  useEffect(() => {
    if (!toasts.length) return;
    const t = setInterval(() => {
      const now = Date.now();
      setToasts((xs) => (hover.current ? xs.map((x) => ({ ...x, until: x.until + 1000 })) : xs.filter((x) => x.until > now)));
    }, 1000);
    return () => clearInterval(t);
  }, [toasts.length]);

  // Bảng thông báo nằm ngoài header (portal) — header có backdrop-blur + trên điện thoại chuông không sát mép phải → bị cắt/che
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = bell.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    };
    place();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("resize", place);
    window.addEventListener("keydown", esc);
    return () => (window.removeEventListener("resize", place), window.removeEventListener("keydown", esc));
  }, [open]);

  const unread = items.filter((a) => a.id > seen).length;
  const markRead = () => {
    const top = items[0]?.id ?? 0;
    setSeen(user, top);
    setSeenState(top);
  };
  const dismiss = (a: AlertItem) => {
    hover.current = false;
    setToasts((xs) => xs.filter((x) => x.id !== a.id));
    if (a.id > seen && toasts.length <= 1) markRead();
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={bell}
        type="button"
        onClick={() => (setOpen((o) => !o), markRead())}
        className="relative rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-foreground"
        aria-label={`Thông báo${unread ? ` (${unread} mới)` : ""}`}
        title="Thông báo"
      >
        🔔
        {unread > 0 && (
          <span className="num absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-loss px-1 text-[10px] leading-4 font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {mounted &&
        open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[65] bg-black/40 sm:bg-transparent" onClick={() => setOpen(false)} aria-hidden />
            <div
              role="dialog"
              aria-label="Thông báo"
              style={{ top: pos.top, ["--r" as string]: `${pos.right}px`, maxHeight: `min(32rem, calc(100dvh - ${pos.top}px - 4.5rem - env(safe-area-inset-bottom)))` }}
              className="fixed inset-x-2 z-[70] flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl sm:right-[var(--r)] sm:left-auto sm:w-96"
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs">
                <b>Thông báo</b>
                <Link href="/settings#thong-bao" onClick={() => setOpen(false)} className="text-muted hover:text-accent">
                  ⚙ Chọn loại
                </Link>
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {items.length === 0 && <li className="p-4 text-center text-xs text-muted">Chưa có thông báo nào gần đây.</li>}
                {items.map((a) => (
                  <li key={a.id} className="border-b border-border/50 last:border-0">
                    <button type="button" onClick={() => (setOpen(false), setDetail(a))} className="block w-full px-3 py-2 text-left text-xs hover:bg-accent/10">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`min-w-0 font-semibold break-words ${TONE[a.level].split(" ")[1]}`}>{a.title}</span>
                        <span className="num shrink-0 text-[10px] text-muted">
                          {day(a.at)} {time(a.at)}
                        </span>
                      </div>
                      {a.body && <p className="mt-0.5 line-clamp-2 whitespace-pre-line break-words text-muted">{a.body}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>,
          document.body,
        )}
      {mounted &&
        toasts.length > 0 &&
        createPortal(
          <div className="pointer-events-none fixed right-4 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[60] sm:bottom-16 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
            {toasts.map((a) => (
              <div
                key={a.id}
                role="alert"
                onPointerEnter={() => (hover.current = true)}
                onPointerLeave={() => (hover.current = false)}
                className={`pointer-events-auto rounded-lg border-l-4 border bg-card/95 p-3 text-xs shadow-2xl backdrop-blur ${TONE[a.level].split(" ")[0]}`}>
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => (dismiss(a), setDetail(a))} className="min-w-0 flex-1 text-left">
                    <div className={`font-semibold break-words ${TONE[a.level].split(" ")[1]}`}>{a.title}</div>
                    {a.body && <p className="mt-1 line-clamp-4 whitespace-pre-line break-words text-foreground/80">{a.body}</p>}
                    <div className="mt-1 text-[10px] text-muted">
                      {ALERT_KINDS[a.kind]} · {time(a.at)} · <span className="text-accent">Xem đầy đủ</span>
                    </div>
                  </button>
                  <button type="button" onClick={() => dismiss(a)} className="shrink-0 px-1 text-muted hover:text-foreground" aria-label="Đóng">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>,
          document.body,
        )}
      <Modal open={!!detail} title={detail ? ALERT_KINDS[detail.kind] : ""} onClose={() => setDetail(null)}>
        {detail && (
          <div className="text-sm">
            <div className={`font-semibold break-words ${TONE[detail.level].split(" ")[1]}`}>{detail.title}</div>
            <div className="mt-0.5 text-[11px] text-muted">
              {day(detail.at)} {time(detail.at)}
            </div>
            {detail.body && (
              <p className="mt-3 max-h-[60vh] overflow-y-auto whitespace-pre-line break-words text-foreground/90">{detail.body}</p>
            )}
            <Link href={href(detail)} onClick={() => setDetail(null)} className="mt-4 inline-block text-xs text-accent hover:underline">
              {detail.ticker ? `Mở trang ${detail.ticker} →` : "Mở trang liên quan →"}
            </Link>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Mục trong /settings: chọn loại thông báo nổi trong trang (lưu riêng trình duyệt này). */
export function AlertPrefs() {
  const [prefs, save] = usePrefs();
  return (
    <div className="card p-4 text-xs">
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(ALERT_KINDS) as AlertKind[]).map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={prefs.kinds[k]} onChange={() => save({ kinds: { ...prefs.kinds, [k]: !prefs.kinds[k] } })} className="accent-[var(--color-accent)]" />
            {ALERT_KINDS[k]}
          </label>
        ))}
      </div>
      <p className="mt-2 text-muted">
        Hỏi thông báo mới theo lịch cron: trong phiên 30 giây/lần, 15h–17h30 (đồng bộ giá + quét tín hiệu) 1 phút/lần, còn lại 5 phút. Thông báo tự đóng sau 12
        giây (cắt lỗ / cảnh báo: 30 giây), rê chuột vào để giữ lại; xem lại trong chuông 🔔.
      </p>
    </div>
  );
}
