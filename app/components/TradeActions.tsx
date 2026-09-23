"use client";

import { useState } from "react";
import { QUICK_PCT, quickExit } from "@/lib/risk/quick";
import { Button, Field, Modal, ModalForm, inputCls, useApi } from "./ui";
import { SymbolHits, useSymbolHits } from "./StockSearch";

export interface TradeRow {
  id: number;
  ticker: string;
  qty: number;
  entry: number;
  stop: number | null;
  target: number | null;
  exit: number | null;
  status: string;
  note: string | null;
  price?: number | null; // giá hiện tại — gợi ý giá bán khi đóng
}

const v = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(+n.toFixed(2)));

/** Ô mã có gợi ý (mã hoặc tên công ty) — chọn xong gọi onPicked (điền sẵn giá vốn = giá hiện tại nếu trống). */
function TickerInput({ onPicked }: { onPicked: (ticker: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { hits, sel, setSel, onKey } = useSymbolHits(open ? q : "");
  const pick = (t: string) => (setQ(t), setOpen(false), onPicked(t));
  return (
    <div className="relative">
      <input
        name="ticker"
        required
        autoFocus
        autoComplete="off"
        value={q}
        onChange={(e) => (setQ(e.target.value.toUpperCase()), setOpen(true))}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => open && onKey(e, (h) => pick(h.ticker))}
        placeholder="Gõ mã hoặc tên công ty — VD: FPT, HOA PHAT"
        className={`${inputCls} w-full`}
      />
      {open && <SymbolHits hits={hits} sel={sel} setSel={setSel} onPick={(h) => pick(h.ticker)} className="left-0 w-full" />}
    </div>
  );
}

const fmt = (n: number) => String(+n.toFixed(2));

/**
 * Ô nhập SL/giá/stop/target dùng chung cho thêm + sửa. Cắt lỗ/chốt lời TỰ TÍNH
 * −/+8% theo giá vốn (đổi giá vốn là tính lại) cho tới khi user sửa tay ô đó.
 */
function TradeFields({ t, withTicker }: { t?: Partial<TradeRow>; withTicker?: boolean }) {
  const [entry, setEntry] = useState(v(t?.entry));
  const [manual, setManual] = useState<{ stop: string | null; target: string | null }>({
    stop: t?.stop != null ? v(t.stop) : null,
    target: t?.target != null ? v(t.target) : null,
  });
  const e = Number(entry);
  const auto = (pct: number) => (e > 0 ? fmt(quickExit(e, pct)) : "");
  const stop = manual.stop ?? auto(-QUICK_PCT);
  const target = manual.target ?? auto(QUICK_PCT);
  const prefill = async (ticker: string) => {
    const q = await fetch(`/api/quotes?tickers=${ticker}`)
      .then((r) => r.json())
      .catch(() => null);
    const last = q?.[ticker]?.last;
    if (last) setEntry((cur) => cur || fmt(last));
  };
  const note = (k: "stop" | "target", pct: number) =>
    manual[k] === null ? (
      <span className="text-[11px] text-muted">
        Tự tính {pct > 0 ? "+" : "−"}
        {QUICK_PCT}% theo giá vốn
      </span>
    ) : (
      <button
        type="button"
        disabled={!(e > 0)}
        onClick={() => setManual((m) => ({ ...m, [k]: null }))}
        className={`self-start rounded border border-border px-1.5 py-0.5 text-[11px] font-medium hover:bg-accent/10 disabled:opacity-40 ${pct > 0 ? "text-gain" : "text-loss"}`}
      >
        ↺ Tự tính {pct > 0 ? "+" : "−"}
        {QUICK_PCT}%{e > 0 && ` → ${auto(pct)}`}
      </button>
    );
  return (
    <>
      {withTicker && (
        <Field label="Mã cổ phiếu">
          <TickerInput onPicked={prefill} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Số lượng (cp)">
          <input name="qty" required inputMode="numeric" defaultValue={t?.qty ?? ""} placeholder="1000" className={inputCls} />
        </Field>
        <Field label="Giá vốn (nghìn đ)">
          <input name="entry" required inputMode="decimal" value={entry} onChange={(x) => setEntry(x.target.value)} placeholder="95.5" className={inputCls} />
        </Field>
        <Field label="Cắt lỗ (nghìn đ)">
          <input name="stop" inputMode="decimal" value={stop} onChange={(x) => setManual((m) => ({ ...m, stop: x.target.value }))} className={inputCls} />
          {note("stop", -QUICK_PCT)}
        </Field>
        <Field label="Chốt lời (nghìn đ)">
          <input name="target" inputMode="decimal" value={target} onChange={(x) => setManual((m) => ({ ...m, target: x.target.value }))} className={inputCls} />
          {note("target", QUICK_PCT)}
        </Field>
      </div>
    </>
  );
}

export function AddTradeButton() {
  const [open, setOpen] = useState(false);
  const { call, busy } = useApi();
  return (
    <>
      <Button tone="primary" size="sm" onClick={() => setOpen(true)}>
        ＋ Thêm vị thế
      </Button>
      <Modal open={open} title="Thêm vị thế đã mua" onClose={() => setOpen(false)}>
        <ModalForm
          busy={busy}
          submitText="Thêm"
          onCancel={() => setOpen(false)}
          onSubmit={(f) => call("POST", "/api/trades", f, `Đã thêm ${f.ticker.toUpperCase()} — watcher đang canh`)}
        >
          <TradeFields withTicker />
          <Field label="Ghi chú">
            <input name="note" className={inputCls} placeholder="Lý do mua…" />
          </Field>
        </ModalForm>
      </Modal>
    </>
  );
}

export function TradeActions({ t }: { t: TradeRow }) {
  const [mode, setMode] = useState<"edit" | "close" | null>(null);
  const { call, busy } = useApi();
  const closed = t.status === "closed";
  const url = `/api/trades/${t.id}`;
  return (
    <div className="flex justify-end gap-1">
      {!closed && (
        <Button size="sm" tone="gain" onClick={() => setMode("close")}>
          Bán
        </Button>
      )}
      <Button size="sm" onClick={() => setMode("edit")}>
        Sửa
      </Button>
      <Button
        size="sm"
        tone="danger"
        disabled={busy}
        onClick={() => confirm(`Xóa lệnh ${t.ticker} #${t.id}? Không hoàn tác được.`) && call("DELETE", url, {}, `Đã xóa ${t.ticker}`)}
        aria-label="Xóa"
      >
        ✕
      </Button>

      <Modal open={mode === "edit"} title={`Sửa ${t.ticker} #${t.id}`} onClose={() => setMode(null)}>
        <ModalForm busy={busy} submitText="Lưu" onCancel={() => setMode(null)} onSubmit={(f) => call("PATCH", url, f, "Đã lưu")}>
          <TradeFields t={t} />
          {closed && (
            <Field label="Giá bán (nghìn đ)" hint="Sửa giá bán sẽ tính lại lãi/lỗ">
              <input name="exit" required inputMode="decimal" defaultValue={v(t.exit)} className={inputCls} />
            </Field>
          )}
          <Field label="Ghi chú">
            <input name="note" defaultValue={t.note ?? ""} className={inputCls} />
          </Field>
        </ModalForm>
      </Modal>

      <Modal open={mode === "close"} title={`Bán ${t.ticker} — đóng vị thế`} onClose={() => setMode(null)}>
        <ModalForm
          busy={busy}
          tone="gain"
          submitText="Xác nhận bán"
          onCancel={() => setMode(null)}
          onSubmit={(f) => call("PATCH", url, { close: true, exit: f.exit }, `Đã đóng ${t.ticker}`)}
        >
          <p className="text-xs text-muted">
            {t.qty.toLocaleString("en-US")}cp · giá vốn <span className="num">{v(t.entry)}</span>. Lãi/lỗ tính sau phí mua 0,15% + phí bán
            0,15% + thuế 0,1%.
          </p>
          <Field label="Giá bán (nghìn đ)" hint={t.price ? "Mặc định = giá hiện tại" : undefined}>
            <input name="exit" required autoFocus inputMode="decimal" defaultValue={v(t.price)} className={inputCls} />
          </Field>
        </ModalForm>
      </Modal>
    </div>
  );
}
