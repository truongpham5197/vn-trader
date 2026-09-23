"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { inputCls } from "./ui";
import { px } from "@/lib/format";

type PlanOk = {
  qty: number;
  reasons: string[];
  assumptions: string[];
  warnings: string[];
  entry: number;
  stop: number;
  target: number;
  entrySource: string;
  lossAtStop: number;
  gainAtTarget: number;
  valueVnd: number;
  costVnd: number;
  riskVnd: number;
  informational: true;
  ticker: string;
  error?: undefined;
};

const tr = (v: number) => `${v >= 0 ? "+" : ""}${(v / 1e6).toFixed(2)}tr`;
const SOURCE: Record<string, string> = {
  query: "giá bạn nhập",
  quote: "giá khớp gần nhất",
  ref: "giá tham chiếu",
  signal: "giá tín hiệu",
};

/** Gợi ý KL theo vốn/vị thế người đang đăng nhập — chỉ xem, không đặt lệnh. */
export default function SignalPlan({ signalId }: { signalId: number }) {
  const [plan, setPlan] = useState<PlanOk | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [draft, setDraft] = useState("");
  const ac = useRef<AbortController | null>(null);

  const load = useCallback(
    async (entryRaw?: string) => {
      ac.current?.abort();
      const next = new AbortController();
      ac.current = next;
      setBusy(true);
      setErr(null);
      const q = new URLSearchParams();
      const e = entryRaw?.trim().replace(",", ".");
      if (e) q.set("entry", e);
      try {
        const res = await fetch(`/api/signals/${signalId}/plan${q.size ? `?${q}` : ""}`, {
          signal: next.signal,
          credentials: "same-origin",
        });
        const j = (await res.json().catch(() => null)) as PlanOk | { error?: string } | null;
        if (next.signal.aborted) return;
        if (!res.ok || !j || !("qty" in j)) {
          setPlan(null);
          setErr((j && "error" in j && j.error) || `Lỗi ${res.status}`);
          return;
        }
        setPlan(j);
        setDraft(String(j.entry));
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
        setPlan(null);
        setErr("Mất kết nối — thử lại");
      } finally {
        if (!next.signal.aborted) setBusy(false);
      }
    },
    [signalId],
  );

  useEffect(() => {
    void load();
    return () => ac.current?.abort();
  }, [load]);

  const apply = () => void load(draft);

  return (
    <div className="space-y-2 text-xs">
      <div className="font-semibold text-foreground">📐 Khối lượng gợi ý cho bạn</div>
      <p className="text-muted">
        Mô hình mục tiêu — không đảm bảo khớp, cắt lỗ, chốt lời hay T+2. Chỉ tham khảo, không đặt lệnh;
        nhật ký «Đã mua» vẫn nhập tay.
      </p>
      {err && <p className="text-loss">{err}</p>}
      {plan && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-muted">
              Giá mua dự kiến (nghìn đ)
              <input
                className={inputCls}
                inputMode="decimal"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={apply}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), apply())}
              />
            </label>
            <button
              type="button"
              onClick={apply}
              disabled={busy}
              className="rounded-md border border-border px-2 py-2 text-muted hover:text-foreground disabled:opacity-50"
            >
              {busy ? "Đang tính…" : "Tính lại"}
            </button>
          </div>
          <div className="num grid grid-cols-3 gap-2">
            <div>
              <div className="text-[10px] text-muted">KL gợi ý</div>
              <div className="text-sm font-semibold">{plan.qty.toLocaleString("en-US")} cp</div>
            </div>
            <div>
              <div className="text-[10px] text-muted">Nếu cắt lỗ</div>
              <div className={plan.lossAtStop >= 0 ? "text-gain" : "text-loss"}>{tr(plan.lossAtStop)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted">Nếu chốt lời</div>
              <div className={plan.gainAtTarget >= 0 ? "text-gain" : "text-loss"}>{tr(plan.gainAtTarget)}</div>
            </div>
          </div>
          <p className="text-muted">
            {plan.ticker} · mua {px(plan.entry)} ({SOURCE[plan.entrySource] ?? plan.entrySource}) · SL{" "}
            <span className="text-loss">{px(plan.stop)}</span> · TP <span className="text-gain">{px(plan.target)}</span>
            {plan.qty > 0 && (
              <>
                {" "}
                · giá trị {tr(plan.valueVnd).replace("+", "")} · rủi ro {tr(plan.riskVnd).replace("+", "")}
              </>
            )}
          </p>
          {plan.warnings.map((w) => (
            <p key={w} className="text-accent">
              ⚠ {w}
            </p>
          ))}
          {plan.reasons.map((w) => (
            <p key={w} className="text-muted">
              • {w}
            </p>
          ))}
          <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-muted/80">
            {plan.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </>
      )}
      {busy && !plan && !err && <p className="text-muted">Đang tính gợi ý theo vốn của bạn…</p>}
    </div>
  );
}
