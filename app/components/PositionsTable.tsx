"use client";

import Link from "next/link";
import type { PositionLine } from "@/lib/report/positions";
import { px } from "@/lib/format";
import { netPnl, netPnlPct } from "@/lib/fees";
import { TradeActions } from "./TradeActions";
import { LiveBadge, useQuotes } from "./live";

const pct = (v: number | null) =>
  v === null ? "?" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const tone = (v: number | null) => ((v ?? 0) >= 0 ? "text-gain" : "text-loss");

/** Giá server render → ghi đè bằng giá live khi có, tính lại lãi/lỗ. */
function withLive(
  p: PositionLine,
  q: { last: number | null; ref: number | null } | null | undefined,
): PositionLine {
  const price = q?.last ?? p.price;
  if (price === null) return p;
  const ref = q?.ref ?? p.prevClose;
  return {
    ...p,
    price,
    pnlPct: netPnlPct(p.entry, price),
    pnlVnd: netPnl(p.entry, price, p.qty),
    dayPct: ref ? (price / ref - 1) * 100 : p.dayPct,
  };
}

/** Vị thế đang giữ — giá live nến 1m (tự cập nhật), kèm nút Bán/Sửa/Xóa. */
export default function PositionsTable({
  positions: rows,
}: {
  positions: PositionLine[];
}) {
  const quotes = useQuotes(rows.map((p) => p.ticker));
  const positions = rows.map((p) => withLive(p, quotes[p.ticker]));
  if (!positions.length) {
    return (
      <p className="card p-6 text-center text-muted">
        Chưa có vị thế nào. Bấm <b>＋ Thêm vị thế</b> hoặc <b>Đã mua</b> ở một
        tín hiệu.
      </p>
    );
  }
  return (
    <div>
      <div className="mb-1 text-right">
        <LiveBadge />
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="p-3 font-medium">Mã</th>
              <th className="p-3 text-right font-medium">SL</th>
              <th className="p-3 text-right font-medium">Giá vốn</th>
              <th className="p-3 text-right font-medium">Giá hiện tại</th>
              <th className="p-3 text-right font-medium">Lãi/lỗ</th>
              <th className="p-3 text-right font-medium">Hôm nay</th>
              <th className="p-3 text-right font-medium">Cắt lỗ</th>
              <th className="p-3 text-right font-medium">Chốt lời</th>
              <th className="p-3 font-medium">T+</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              // Cảnh báo khi giá đã sát/qua cắt lỗ hoặc chạm chốt lời
              const nearStop =
                p.price !== null && p.stop !== null && p.price <= p.stop * 1.02;
              const hitTarget =
                p.price !== null && p.target !== null && p.price >= p.target;
              return (
                <tr
                  key={p.id}
                  className="border-b border-border/50 last:border-0 hover:bg-white/[0.03]"
                >
                  <td className="p-3">
                    <div className="font-semibold">
                      <Link
                        href={`/stock/${p.ticker}`}
                        className="hover:text-accent"
                      >
                        {p.ticker}
                      </Link>
                      {nearStop && (
                        <span className="ml-1.5 rounded bg-loss/15 px-1.5 py-0.5 text-[10px] text-loss">
                          sát cắt lỗ
                        </span>
                      )}
                      {hitTarget && (
                        <span className="ml-1.5 rounded bg-gain/15 px-1.5 py-0.5 text-[10px] text-gain">
                          chạm chốt lời
                        </span>
                      )}
                    </div>
                    {p.note && !p.note.startsWith("manual") && (
                      <div className="max-w-40 truncate text-[11px] text-muted">
                        {p.note}
                      </div>
                    )}
                  </td>
                  <td className="num p-3 text-right">
                    {p.qty.toLocaleString("en-US")}
                  </td>
                  <td className="num p-3 text-right">{px(p.entry)}</td>
                  <td className="num p-3 text-right font-medium">
                    {px(p.price, "?")}
                  </td>
                  <td
                    className={`num p-3 text-right font-medium ${tone(p.pnlPct)}`}
                  >
                    {pct(p.pnlPct)}
                    {p.pnlVnd !== null && (
                      <div className="text-[11px] text-muted">
                        {p.pnlVnd >= 0 ? "+" : ""}
                        {(p.pnlVnd / 1e6).toFixed(2)}tr
                      </div>
                    )}
                  </td>
                  <td className={`num p-3 text-right ${tone(p.dayPct)}`}>
                    {pct(p.dayPct)}
                  </td>
                  <td className="num p-3 text-right text-loss">{px(p.stop)}</td>
                  <td className="num p-3 text-right text-gain">
                    {px(p.target)}
                  </td>
                  <td className="p-3 whitespace-nowrap text-muted">
                    {p.sessionsHeld >= 2
                      ? "✓ bán được"
                      : `⏳T+${p.sessionsHeld}`}
                  </td>
                  <td className="p-3">
                    <TradeActions
                      t={{
                        id: p.id,
                        ticker: p.ticker,
                        qty: p.qty,
                        entry: p.entry,
                        stop: p.stop,
                        target: p.target,
                        exit: null,
                        status: "open",
                        note: p.note,
                        price: p.price,
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
