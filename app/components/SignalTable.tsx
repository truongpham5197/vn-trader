"use client";

import { Fragment, useState } from "react";
import { Button, Field, Modal, ModalForm, inputCls, useApi } from "./ui";
import SignalDetail from "./SignalDetail";

export const STATUS: Record<string, [string, string]> = {
  new: ["Mới", "text-accent"],
  notified: ["Chờ xử lý", "text-accent"],
  taken: ["Đã mua", "text-gain"],
  filled: ["Đã khớp", "text-gain"],
  ordered: ["Đã đặt lệnh", "text-gain"],
  skipped: ["Bỏ qua", "text-muted line-through"],
  expired: ["Hết hạn", "text-muted"],
};

export interface SignalRow {
  id: number;
  date: string;
  entry: number;
  stop: number;
  target: number;
  qty: number;
  rr: number;
  status: string;
  reason: string | null;
  plan: string | null;
  buyLow: number | null;
  buyHigh: number | null;
  symbol: { ticker: string; sector?: string | null };
  strategy: { name: string };
}

const f2 = (n: number) => n.toFixed(2);

export default function SignalTable({ signals, showDate = true }: { signals: SignalRow[]; showDate?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="card overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            {showDate && <th className="p-3 font-medium">Nến</th>}
            <th className="p-3 font-medium">Mã</th>
            <th className="p-3 font-medium">Chiến lược</th>
            <th className="p-3 text-right font-medium">Vùng mua</th>
            <th className="p-3 text-right font-medium">Cắt lỗ</th>
            <th className="p-3 text-right font-medium">Chốt lời</th>
            <th className="p-3 text-right font-medium">SL gợi ý</th>
            <th className="p-3 text-right font-medium" title="Lãi kỳ vọng / lỗ rủi ro">R:R</th>
            <th className="p-3 font-medium">Trạng thái</th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => {
            const up = ((s.target - s.entry) / s.entry) * 100;
            const dn = ((s.entry - s.stop) / s.entry) * 100;
            const [label, cls] = STATUS[s.status] ?? [s.status, ""];
            const expanded = open === s.id;
            return (
              <Fragment key={s.id}>
                <tr
                  onClick={() => setOpen(expanded ? null : s.id)}
                  className="cursor-pointer border-b border-border/50 transition-colors hover:bg-white/[0.03]"
                >
                  {showDate && <td className="num p-3 text-muted">{s.date}</td>}
                  <td className="p-3">
                    <div className="font-semibold">
                      {s.symbol.ticker} <span className="text-[10px] font-normal text-accent">{expanded ? "▾ ẩn" : "▸ vì sao?"}</span>
                    </div>
                    <div className="max-w-32 truncate text-[11px] text-muted">{s.symbol.sector ?? ""}</div>
                  </td>
                  <td className="p-3 text-muted">{s.strategy.name}</td>
                  <td className="num p-3 text-right">
                    {s.buyLow && s.buyHigh ? `${f2(s.buyLow)}–${f2(s.buyHigh)}` : f2(s.entry)}
                  </td>
                  <td className="num p-3 text-right text-loss">
                    {f2(s.stop)} <span className="text-muted">−{dn.toFixed(1)}%</span>
                  </td>
                  <td className="num p-3 text-right text-gain">
                    {f2(s.target)} <span className="text-muted">+{up.toFixed(1)}%</span>
                  </td>
                  <td className="num p-3 text-right">{s.qty.toLocaleString("en-US")}</td>
                  <td className="num p-3 text-right">{s.rr.toFixed(1)}</td>
                  <td className={`p-3 whitespace-nowrap ${cls}`}>{label}</td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <SignalActions s={s} />
                  </td>
                </tr>
                {expanded && (
                  <tr className="border-b border-border/50 bg-white/[0.02]">
                    <td colSpan={showDate ? 10 : 9} className="px-3 py-3">
                      {/* sticky + giới hạn rộng để trên mobile không phải cuộn ngang theo bảng */}
                      <div className="sticky left-3 max-w-[calc(100vw-4rem)] lg:max-w-none">
                        <SignalDetail ticker={s.symbol.ticker} reason={s.reason} plan={s.plan} />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SignalActions({ s }: { s: SignalRow }) {
  const [buy, setBuy] = useState(false);
  const { call, busy } = useApi();
  const url = `/api/signals/${s.id}`;
  const pending = s.status === "new" || s.status === "notified";
  return (
    <div className="flex justify-end gap-1 whitespace-nowrap">
      {pending ? (
        <>
          <Button size="sm" tone="gain" onClick={() => setBuy(true)}>
            Đã mua
          </Button>
          <Button size="sm" disabled={busy} onClick={() => call("PATCH", url, { action: "skip" }, `Bỏ qua ${s.symbol.ticker}`)}>
            Bỏ qua
          </Button>
        </>
      ) : (
        s.status === "skipped" && (
          <Button size="sm" disabled={busy} onClick={() => call("PATCH", url, { action: "reset" }, "Đã khôi phục")}>
            Hoàn tác
          </Button>
        )
      )}
      <Button
        size="sm"
        tone="danger"
        disabled={busy}
        aria-label="Xóa"
        onClick={() => confirm(`Xóa tín hiệu ${s.symbol.ticker} (${s.strategy.name})?`) && call("DELETE", url, {}, "Đã xóa tín hiệu")}
      >
        ✕
      </Button>
      <Modal open={buy} title={`Đã mua ${s.symbol.ticker}`} onClose={() => setBuy(false)}>
        <ModalForm
          busy={busy}
          tone="gain"
          submitText="Mở vị thế"
          onCancel={() => setBuy(false)}
          onSubmit={(f) => call("PATCH", url, { action: "take", ...f }, `Đã mở vị thế ${s.symbol.ticker} — watcher đang canh`)}
        >
          <p className="text-xs text-muted">
            Cắt lỗ <span className="num text-loss">{f2(s.stop)}</span> · chốt lời <span className="num text-gain">{f2(s.target)}</span> — sửa sau ở
            trang Vị thế.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Số lượng khớp (cp)">
              <input name="qty" required inputMode="numeric" defaultValue={s.qty} className={inputCls} />
            </Field>
            <Field label="Giá khớp (nghìn đ)">
              <input name="entry" required autoFocus inputMode="decimal" defaultValue={f2(s.entry)} className={inputCls} />
            </Field>
          </div>
        </ModalForm>
      </Modal>
    </div>
  );
}
