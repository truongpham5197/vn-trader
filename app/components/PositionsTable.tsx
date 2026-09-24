"use client";

import Link from "next/link";
import type { PositionLine } from "@/lib/report/positions";
import { px } from "@/lib/format";
import { netPnl, netPnlPct } from "@/lib/fees";
import { bookAdvice, positionAdvice } from "@/lib/risk/advice";
import { TradeActions } from "./TradeActions";
import { LiveBadge, useQuotes } from "./live";
import { More } from "./More";

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

const tradeOf = (p: PositionLine) => ({
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
});

const sticky = "sticky right-0 z-10 bg-card shadow-[-6px_0_8px_-6px_rgba(0,0,0,.45)]";

function BookGuide({ rows }: { rows: PositionLine[] }) {
  const a = bookAdvice(rows);
  if (!a) return null;
  const cls = a.tone === "gain" ? "border-gain/40" : a.tone === "loss" ? "border-loss/40" : "";
  return (
    <section className={`card mb-3 p-3 text-xs ${cls}`}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Gợi ý chung · đang tập</p>
      <p className="mt-1 text-sm font-semibold">{a.headline}</p>
      <div className="mt-3 space-y-2">
        <div>
          <p className="text-muted">Vì sao</p>
          <p className="mt-0.5 leading-relaxed">{a.why}</p>
        </div>
        <div>
          <p className="text-muted">Làm thế nào</p>
          <ol className="mt-0.5 list-decimal space-y-1 pl-4 leading-relaxed">
            {a.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
        <div>
          <p className="text-muted">Giữ vốn</p>
          <p className="mt-0.5 leading-relaxed">{a.protect}</p>
        </div>
        {a.notes.map((n) => (
          <div key={n.title}>
            <p className="text-muted">{n.title}</p>
            <p className="mt-0.5 font-medium leading-relaxed">{n.verdict}</p>
            <More label="Vì sao">
              <p className="text-[11px] leading-relaxed text-muted">{n.why}</p>
            </More>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Theo cắt lỗ và chốt lời bạn đã đặt. Chỉ cảnh báo — không bán hộ, không bảo mua thêm, không phải dự báo sẽ lãi.
      </p>
    </section>
  );
}

function AdviceLine({ p }: { p: PositionLine }) {
  const a = positionAdvice(p);
  const cls = a.tone === "gain" ? "text-gain" : a.tone === "loss" ? "text-loss" : "text-amber-300";
  return (
    <div className="mt-1 max-w-56">
      <p className={`text-[11px] font-medium ${cls}`}>{a.line}</p>
      <More label="Vì sao">
        <p className="text-[11px] text-muted">{a.detail}</p>
      </More>
    </div>
  );
}

/** Thẻ vị thế cho mobile. */
function PositionCard({ p }: { p: PositionLine }) {
  return (
    <div className="card p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/stock/${p.ticker}`} className="text-sm font-semibold hover:text-accent">
            {p.ticker}
          </Link>
          <div className="text-[11px] text-muted">
            <span className="num">{p.qty.toLocaleString("en-US")}</span> cp · vốn <span className="num">{px(p.entry)}</span> ·{" "}
            {p.sessionsHeld >= 2 ? "✓ bán được" : `⏳T+${p.sessionsHeld}`}
          </div>
          <AdviceLine p={p} />
        </div>
        <div className="num shrink-0 text-right">
          <div className="text-sm font-medium">{px(p.price, "?")}</div>
          <div className={`text-[11px] ${tone(p.dayPct)}`}>hôm nay {pct(p.dayPct)}</div>
        </div>
      </div>
      <div className="num mt-2 grid grid-cols-3 gap-2">
        <div>
          <div className="text-[10px] text-muted">Lãi/lỗ</div>
          <span className={`font-medium ${tone(p.pnlPct)}`}>{pct(p.pnlPct)}</span>
          {p.pnlVnd !== null && (
            <div className="text-[10px] text-muted">
              {p.pnlVnd >= 0 ? "+" : ""}
              {(p.pnlVnd / 1e6).toFixed(2)}tr
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] text-muted">Cắt lỗ</div>
          <span className="text-loss">{px(p.stop)}</span>
        </div>
        <div>
          <div className="text-[10px] text-muted">Chốt lời</div>
          <span className="text-gain">{px(p.target)}</span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-1">
        <TradeActions t={tradeOf(p)} />
      </div>
    </div>
  );
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
      <BookGuide rows={positions} />
      <div className="mb-1 text-right">
        <LiveBadge />
      </div>
      <div className="flex flex-col gap-2 sm:hidden">
        {positions.map((p) => (
          <PositionCard key={p.id} p={p} />
        ))}
      </div>
      <div className="card hidden overflow-x-auto sm:block">
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
              <th className={`p-3 ${sticky}`} />
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
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
                    </div>
                    <AdviceLine p={p} />
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
                  <td className={`p-3 ${sticky}`}>
                    <TradeActions t={tradeOf(p)} />
                  </td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
