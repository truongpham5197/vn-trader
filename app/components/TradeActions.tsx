"use client";

import { useState } from "react";
import { Button, Field, Modal, ModalForm, inputCls, useApi } from "./ui";

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

/** Ô nhập SL/giá/stop/target dùng chung cho thêm + sửa. */
function TradeFields({ t, withTicker }: { t?: Partial<TradeRow>; withTicker?: boolean }) {
  return (
    <>
      {withTicker && (
        <Field label="Mã cổ phiếu">
          <input name="ticker" required autoFocus placeholder="VD: FPT" className={`${inputCls} uppercase`} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Số lượng (cp)">
          <input name="qty" required inputMode="numeric" defaultValue={t?.qty ?? ""} placeholder="1000" className={inputCls} />
        </Field>
        <Field label="Giá vốn (nghìn đ)">
          <input name="entry" required inputMode="decimal" defaultValue={v(t?.entry)} placeholder="95.5" className={inputCls} />
        </Field>
        <Field label="Cắt lỗ (nghìn đ)" hint="Để trống = không canh">
          <input name="stop" inputMode="decimal" defaultValue={v(t?.stop)} className={inputCls} />
        </Field>
        <Field label="Chốt lời (nghìn đ)">
          <input name="target" inputMode="decimal" defaultValue={v(t?.target)} className={inputCls} />
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
