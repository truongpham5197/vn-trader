"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export const inputCls =
  "num w-full rounded-md border border-border bg-background px-2.5 py-2 text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none";

const BTN = {
  primary: "border-accent/60 bg-accent/15 text-accent hover:bg-accent/25",
  gain: "border-gain/50 bg-gain/10 text-gain hover:bg-gain/20",
  danger: "border-loss/50 bg-loss/10 text-loss hover:bg-loss/20",
  ghost: "border-border text-muted hover:border-accent hover:text-foreground",
};

export function Button({
  tone = "ghost",
  size = "md",
  className = "",
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof BTN; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <button
      type="button"
      {...p}
      className={`rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sz} ${BTN[tone]} ${className}`}
    />
  );
}

/** Hiện toast góc dưới — gọi từ bất cứ client component nào. */
export function toast(text: string, ok = true) {
  window.dispatchEvent(new CustomEvent("app-toast", { detail: { text, ok } }));
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; text: string; ok: boolean }[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const { text, ok } = (e as CustomEvent<{ text: string; ok: boolean }>).detail;
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs, { id, text, ok }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), ok ? 3000 : 6000);
    };
    window.addEventListener("app-toast", on);
    return () => window.removeEventListener("app-toast", on);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto max-w-md rounded-lg border px-4 py-2.5 text-sm shadow-lg backdrop-blur ${
            t.ok ? "border-gain/40 bg-card/95 text-gain" : "border-loss/40 bg-card/95 text-loss"
          }`}
        >
          {t.ok ? "✓ " : "⚠ "}
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Gọi API JSON → toast kết quả → refresh dữ liệu server. Trả true nếu thành công. */
export function useApi() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function call(method: string, url: string, body: unknown, okText: string) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) {
        toast((await res.json().catch(() => null))?.error ?? `Lỗi ${res.status}`, false);
        return false;
      }
      toast(okText);
      router.refresh();
      return true;
    } catch {
      toast("Mất kết nối — thử lại", false);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { call, busy };
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-card p-0 text-foreground backdrop:bg-black/60"
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold">{title}</h3>
            <button type="button" onClick={onClose} className="text-muted hover:text-foreground" aria-label="Đóng">
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {children}
      {hint && <span className="text-[11px] text-muted/80">{hint}</span>}
    </label>
  );
}

/** Form trong modal: submit → onSubmit trả true thì đóng. */
export function ModalForm({
  onSubmit,
  busy,
  submitText,
  tone = "primary",
  children,
  onCancel,
}: {
  onSubmit: (f: Record<string, string>) => Promise<boolean>;
  busy: boolean;
  submitText: string;
  tone?: keyof typeof BTN;
  children: React.ReactNode;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
        if (await onSubmit(f)) onCancel();
      }}
      className="flex flex-col gap-3"
    >
      {children}
      <div className="mt-2 flex justify-end gap-2">
        <Button onClick={onCancel}>Hủy</Button>
        <Button type="submit" tone={tone} disabled={busy}>
          {busy ? "Đang lưu…" : submitText}
        </Button>
      </div>
    </form>
  );
}
