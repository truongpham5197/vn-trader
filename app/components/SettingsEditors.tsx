"use client";

import { useState } from "react";
import { Button, inputCls, useApi } from "./ui";

const PARAM_LABEL: Record<string, string> = {
  donchian: "Số phiên đỉnh cũ",
  volMult: "Khối lượng ≥ × TB20",
  atrPeriod: "Chu kỳ ATR",
  atrStopMult: "Cắt lỗ = × ATR",
  rrTarget: "Chốt lời = × rủi ro (R:R)",
  maFast: "MA nhanh",
  maSlow: "MA chậm (xu hướng)",
  volDryMult: "Vol cạn ≤ × TB20",
  rsiPeriod: "Chu kỳ RSI",
  rsiBuyBelow: "Mua khi RSI <",
  rsiSellAbove: "Bán khi RSI >",
};

const DESC: Record<string, string> = {
  "breakout-20": "Mua khi giá đóng cửa vượt đỉnh N phiên kèm khối lượng bùng.",
  "pullback-ma20": "Mua khi giá trong xu hướng tăng hồi về MA nhanh với khối lượng cạn.",
  "rsi2-revert": "Mua khi RSI ngắn hạn quá bán trong xu hướng tăng → hồi kỹ thuật.",
};

export interface StrategyInfo {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
  params: Record<string, number>;
  defaults: Record<string, number>;
  recent: number; // số tín hiệu 30 ngày
}

export function StrategyCard({ s }: { s: StrategyInfo }) {
  const { call, busy } = useApi();
  const [vals, setVals] = useState(() => Object.fromEntries(Object.entries(s.params).map(([k, v]) => [k, String(v)])));
  const dirty = Object.entries(vals).some(([k, v]) => Number(v.replace(",", ".")) !== s.params[k]);
  const custom = Object.entries(s.params).some(([k, v]) => s.defaults[k] !== v);
  return (
    <div className={`card p-4 ${s.enabled ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{s.name}</div>
          <div className="mt-0.5 text-xs text-muted">{DESC[s.type] ?? s.type}</div>
          <div className="mt-1 text-xs text-muted">
            <span className="num text-foreground">{s.recent}</span> tín hiệu / 30 ngày
          </div>
        </div>
        <Button
          size="sm"
          tone={s.enabled ? "gain" : "ghost"}
          disabled={busy}
          onClick={() => call("PATCH", `/api/strategies/${s.id}`, { enabled: !s.enabled }, s.enabled ? `Đã tắt ${s.name}` : `Đã bật ${s.name}`)}
        >
          {s.enabled ? "● Đang bật" : "○ Đang tắt"}
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Object.keys(s.defaults).map((k) => (
          <label key={k} className="flex flex-col gap-1 text-[11px] text-muted" title={`Mặc định ${s.defaults[k]}`}>
            {PARAM_LABEL[k] ?? k}
            <input
              value={vals[k] ?? ""}
              inputMode="decimal"
              onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
              className={`${inputCls} py-1.5 ${Number(vals[k]) !== s.defaults[k] ? "border-accent/50" : ""}`}
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        {custom && (
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              if (await call("PATCH", `/api/strategies/${s.id}`, { params: {} }, "Đã về mặc định"))
                setVals(Object.fromEntries(Object.entries(s.defaults).map(([k, v]) => [k, String(v)])));
            }}
          >
            Về mặc định
          </Button>
        )}
        <Button size="sm" tone="primary" disabled={!dirty || busy} onClick={() => call("PATCH", `/api/strategies/${s.id}`, { params: vals }, "Đã lưu tham số — áp dụng từ lần quét tới")}>
          Lưu tham số
        </Button>
      </div>
    </div>
  );
}

export function WatchlistEditor({ tickers }: { tickers: string[] }) {
  const { call, busy } = useApi();
  const [v, setV] = useState("");
  return (
    <div className="card p-4">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await call("POST", "/api/watchlist", { ticker: v }, `Đã thêm ${v.toUpperCase()}`)) setV("");
        }}
      >
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="Thêm mã, vd: FPT, MWG"
          className={`${inputCls} uppercase`}
        />
        <Button type="submit" tone="primary" disabled={busy || !v.trim()}>
          Thêm
        </Button>
      </form>
      {tickers.length === 0 ? (
        <p className="mt-3 text-xs text-muted">Chưa có mã nào.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {tickers.map((t) => (
            <span key={t} className="flex items-center gap-1.5 rounded-full border border-border py-1 pr-1.5 pl-3 text-xs font-semibold">
              {t}
              <button
                type="button"
                disabled={busy}
                aria-label={`Xóa ${t}`}
                onClick={() => call("DELETE", "/api/watchlist", { ticker: t }, `Đã xóa ${t}`)}
                className="rounded-full px-1 text-muted hover:bg-loss/15 hover:text-loss"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
