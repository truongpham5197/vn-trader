"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Button, Field, Modal, ModalForm, inputCls, useApi } from "./ui";
import SignalDetail from "./SignalDetail";
import SignalPlan from "./SignalPlan";
import { LivePrice } from "./live";
import OpportunityStatus from "./OpportunityStatus";
import { strategyLabel } from "@/lib/strategy/labels";

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

export default function SignalTable({
  signals,
  showDate = true,
  owner = false,
  latestSession,
  marketWeak,
}: {
  signals: SignalRow[];
  showDate?: boolean;
  /** Trạng thái tín hiệu dùng chung — chỉ chủ app bỏ qua/khôi phục/xóa. */
  owner?: boolean;
  latestSession?: string | null;
  marketWeak?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className="flex flex-col gap-2 sm:hidden">
        {signals.map((s) => (
          <SignalCard
            key={s.id}
            s={s}
            showDate={showDate}
            owner={owner}
            latestSession={latestSession}
            marketWeak={marketWeak}
            expanded={open === s.id}
            toggle={() => setOpen(open === s.id ? null : s.id)}
          />
        ))}
      </div>
    <div className="card hidden overflow-x-auto sm:block">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            {showDate && <th className="p-3 font-medium">Nến</th>}
            <th className="p-3 font-medium">Mã</th>
            <th className="p-3 font-medium">Chiến lược</th>
            <th className="p-3 text-right font-medium">Vùng mua</th>
            <th className="p-3 text-right font-medium">Cắt lỗ</th>
            <th className="p-3 text-right font-medium">Mục tiêu</th>
            <th
              className="p-3 text-right font-medium"
              title="Tỷ lệ mục tiêu/rủi ro tại giá tham chiếu, chưa trừ phí; không phải xác suất thắng"
            >
              R:R
            </th>
            <th className="p-3 font-medium">Việc cần làm</th>
            <th className="sticky right-0 z-10 bg-card p-3" />
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
                      {s.symbol.ticker}{" "}
                      <span className="text-[10px] font-normal text-accent">
                        {expanded ? "▾ ẩn" : "▸ vì sao?"}
                      </span>
                    </div>
                    <div className="max-w-32 truncate text-[11px] text-muted">
                      {s.symbol.sector ?? ""}
                    </div>
                  </td>
                  <td className="p-3 text-muted">{strategyLabel(s.strategy.name)}</td>
                  <td className="num p-3 text-right">
                    {s.buyLow && s.buyHigh
                      ? `${f2(s.buyLow)}–${f2(s.buyHigh)}`
                      : f2(s.entry)}
                    <div className="text-[11px] text-muted">
                      giá nay{" "}
                      <LivePrice ticker={s.symbol.ticker} showPct={false} />
                    </div>
                  </td>
                  <td className="num p-3 text-right text-loss">
                    {f2(s.stop)}{" "}
                    <span className="text-muted">−{dn.toFixed(1)}%</span>
                  </td>
                  <td className="num p-3 text-right text-gain">
                    {f2(s.target)}{" "}
                    <span className="text-muted">+{up.toFixed(1)}%</span>
                  </td>
                  <td className="num p-3 text-right">{s.rr.toFixed(1)}</td>
                  <td className="p-3">
                    <span className={cls}>{label}</span>
                    <OpportunityStatus ticker={s.symbol.ticker} date={s.date} latestSession={latestSession} confirmed
                      buyZone={s.buyLow !== null && s.buyHigh !== null ? [s.buyLow, s.buyHigh] : null}
                      stop={s.stop} target={s.target} marketWeak={marketWeak} />
                  </td>
                  <td className="sticky right-0 z-10 bg-card p-3 shadow-[-6px_0_8px_-6px_rgba(0,0,0,.45)]" onClick={(e) => e.stopPropagation()}>
                    <SignalActions s={s} owner={owner} />
                  </td>
                </tr>
                {expanded && (
                  <tr className="border-b border-border/50 bg-white/[0.02]">
                    <td colSpan={showDate ? 9 : 8} className="px-3 py-3">
                      {/* sticky + giới hạn rộng để trên mobile không phải cuộn ngang theo bảng */}
                      <div className="sticky left-3 max-w-[calc(100vw-4rem)] lg:max-w-none">
                        <SignalDetail ticker={s.symbol.ticker} reason={s.reason} plan={s.plan} />
                                                <SignalPlan signalId={s.id} />
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
    </>
  );
}

/** Thẻ tín hiệu cho màn hình hẹp — đủ thông tin như 1 dòng bảng, không cuộn ngang. */
function SignalCard({
  s,
  showDate,
  owner,
  expanded,
  toggle,
  latestSession,
  marketWeak,
}: {
  s: SignalRow;
  showDate: boolean;
  owner: boolean;
  expanded: boolean;
  toggle: () => void;
  latestSession?: string | null;
  marketWeak?: boolean;
}) {
  const up = ((s.target - s.entry) / s.entry) * 100;
  const dn = ((s.entry - s.stop) / s.entry) * 100;
  const [label, cls] = STATUS[s.status] ?? [s.status, ""];
  return (
    <div className="card p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <Link href={`/stock/${s.symbol.ticker}`} className="text-sm font-semibold hover:text-accent">
              {s.symbol.ticker}
            </Link>
            <span className={cls}>{label}</span>
          </div>
          <div className="truncate text-[11px] text-muted">
            {[showDate && `nến ${s.date}`, strategyLabel(s.strategy.name), s.symbol.sector].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] text-muted">giá nay</div>
          <LivePrice ticker={s.symbol.ticker} />
        </div>
      </div>
      <div className="num mt-2 grid grid-cols-3 gap-2">
        <div>
          <div className="text-[10px] text-muted">Vùng mua</div>
          {s.buyLow && s.buyHigh ? `${f2(s.buyLow)}–${f2(s.buyHigh)}` : f2(s.entry)}
        </div>
        <div>
          <div className="text-[10px] text-muted">Cắt lỗ</div>
          <span className="text-loss">{f2(s.stop)}</span> <span className="text-[10px] text-muted">−{dn.toFixed(1)}%</span>
        </div>
        <div>
          <div className="text-[10px] text-muted">Mục tiêu mô hình</div>
          <span className="text-gain">{f2(s.target)}</span> <span className="text-[10px] text-muted">+{up.toFixed(1)}%</span>
        </div>
      </div>
      <div className="mt-1 text-[11px] text-muted">
        R:R tham chiếu trước phí{" "}
        <span className="num text-foreground">{s.rr.toFixed(1)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={toggle} className="py-1 text-accent">
          {expanded ? "▾ Ẩn" : "▸ Chi tiết"}
        </button>
        <SignalActions s={s} owner={owner} />
      </div>
      {expanded && (
        <div className="mt-2 border-t border-border pt-2">
          <SignalDetail ticker={s.symbol.ticker} reason={s.reason} plan={s.plan} />
          <SignalPlan signalId={s.id} />
        </div>
      )}
      <OpportunityStatus ticker={s.symbol.ticker} date={s.date} latestSession={latestSession} confirmed
        buyZone={s.buyLow !== null && s.buyHigh !== null ? [s.buyLow, s.buyHigh] : null}
        stop={s.stop} target={s.target} marketWeak={marketWeak} />
    </div>
  );
}

function SignalActions({ s, owner }: { s: SignalRow; owner: boolean }) {
  const [buy, setBuy] = useState(false);
  const { call, busy } = useApi();
  const url = `/api/signals/${s.id}`;
  const pending = s.status === "new" || s.status === "notified";
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {pending ? (
        <>
          <Button size="sm" tone="gain" onClick={() => setBuy(true)}>
            Đã mua
          </Button>
          <Button
            size="sm"
            disabled={busy}
            hidden={!owner}
            onClick={() =>
              call(
                "PATCH",
                url,
                { action: "skip" },
                `Bỏ qua ${s.symbol.ticker}`,
              )
            }
          >
            Bỏ qua
          </Button>
        </>
      ) : (
        owner &&
        s.status === "skipped" && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              call("PATCH", url, { action: "reset" }, "Đã khôi phục")
            }
          >
            Hoàn tác
          </Button>
        )
      )}
      <Button
        size="sm"
        tone="danger"
        disabled={busy}
        hidden={!owner}
        aria-label="Xóa"
        onClick={() =>
          confirm(`Xóa tín hiệu ${s.symbol.ticker} (${s.strategy.name})?`) &&
          call("DELETE", url, {}, "Đã xóa tín hiệu")
        }
      >
        ✕
      </Button>
      <Modal
        open={buy}
        title={`Đã mua ${s.symbol.ticker}`}
        onClose={() => setBuy(false)}
      >
        <ModalForm
          busy={busy}
          tone="gain"
          submitText="Mở vị thế"
          onCancel={() => setBuy(false)}
          onSubmit={(f) =>
            call(
              "PATCH",
              url,
              { action: "take", ...f },
              `Đã mở vị thế ${s.symbol.ticker} — watcher đang canh`,
            )
          }
        >
          <p className="text-xs text-muted">
            Cắt lỗ <span className="num text-loss">{f2(s.stop)}</span> · chốt
            lời <span className="num text-gain">{f2(s.target)}</span> — sửa sau
            ở trang Vị thế.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Số lượng khớp (cp)">
              <input
                name="qty"
                required
                inputMode="numeric"
                placeholder="Số lượng đã khớp thực tế"
                className={inputCls}
              />
            </Field>
            <Field label="Giá khớp (nghìn đ)">
              <input
                name="entry"
                required
                autoFocus
                inputMode="decimal"
                defaultValue={f2(s.entry)}
                className={inputCls}
              />
            </Field>
          </div>
        </ModalForm>
      </Modal>
    </div>
  );
}
