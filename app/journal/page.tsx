import { prisma } from "@/lib/prisma";
import { positionsReport } from "@/lib/report/positions";
import { px } from "@/lib/format";
import PositionsTable from "../components/PositionsTable";
import { AddTradeButton, TradeActions } from "../components/TradeActions";
import AutoRefresh from "../components/AutoRefresh";

export const dynamic = "force-dynamic";

const EXIT: Record<string, string> = {
  manual: "Bán tay",
  stop: "Chạm cắt lỗ",
  target: "Chạm chốt lời",
  "trailing-ma10": "Trailing MA10",
  "close<ma50": "Thủng MA50",
  "rsi-revert-exit": "RSI hồi",
  "time-stop": "Hết thời gian",
};

export default async function JournalPage() {
  const [positions, closed, orders] = await Promise.all([
    positionsReport(),
    prisma.trade.findMany({
      where: { status: "closed" },
      include: { symbol: true, signal: { include: { strategy: true } } },
      orderBy: { closedAt: "desc" },
      take: 200,
    }),
    prisma.order.findMany({ orderBy: { id: "desc" }, take: 15, include: { signal: { include: { symbol: true } } } }),
  ]);

  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const withSignal = closed.filter((t) => t.signalId).length;
  const planExit = closed.filter((t) => t.signalId && t.exitReason && t.exitReason !== "manual").length;

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl p-4 text-sm sm:p-6">
      <AutoRefresh />
      <h1 className="mb-4 text-xl font-bold tracking-tight">Vị thế &amp; nhật ký</h1>

      <div className="mb-6 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Đang giữ" value={positions.length} />
        <Stat label="Đã đóng" value={closed.length} />
        <Stat label="Tỷ lệ thắng" value={closed.length ? `${((wins / closed.length) * 100).toFixed(0)}%` : "—"} />
        <Stat label="Lãi/lỗ đã chốt" value={`${totalPnl >= 0 ? "+" : ""}${(totalPnl / 1e6).toFixed(2)}tr`} tone={totalPnl} />
        <Stat label="Theo tín hiệu" value={closed.length ? `${((withSignal / closed.length) * 100).toFixed(0)}%` : "—"} />
        <Stat label="Thoát theo kế hoạch" value={withSignal ? `${((planExit / withSignal) * 100).toFixed(0)}%` : "—"} />
      </div>

      <section className="mb-8">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Đang giữ</h2>
          <AddTradeButton />
        </div>
        <PositionsTable positions={positions} />
      </section>

      <section className="mb-8">
        <h2 className="mb-2 font-semibold">Lịch sử đã đóng</h2>
        {closed.length === 0 ? (
          <p className="card p-6 text-center text-muted">Chưa có lệnh nào đóng.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="p-3 font-medium">Mã</th>
                  <th className="p-3 font-medium">Nguồn</th>
                  <th className="p-3 text-right font-medium">SL</th>
                  <th className="p-3 text-right font-medium">Mua</th>
                  <th className="p-3 text-right font-medium">Bán</th>
                  <th className="p-3 text-right font-medium">Lãi/lỗ</th>
                  <th className="p-3 font-medium">Lý do bán</th>
                  <th className="p-3 font-medium">Thời gian</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {closed.map((t) => {
                  const pct = t.pnl !== null ? (t.pnl / (t.entryPrice * t.qty * 1000)) * 100 : null;
                  const d = (x: Date | null) => x?.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(5) ?? "—";
                  return (
                    <tr key={t.id} className="border-b border-border/50 last:border-0 hover:bg-white/[0.03]">
                      <td className="p-3">
                        <div className="font-semibold">{t.symbol.ticker}</div>
                        {t.note && !t.note.startsWith("manual") && <div className="max-w-40 truncate text-[11px] text-muted">{t.note}</div>}
                      </td>
                      <td className="p-3 text-muted">{t.signal?.strategy.name ?? "tay"}</td>
                      <td className="num p-3 text-right">{t.qty.toLocaleString("en-US")}</td>
                      <td className="num p-3 text-right">{px(t.entryPrice)}</td>
                      <td className="num p-3 text-right">{px(t.exitPrice)}</td>
                      <td className={`num p-3 text-right font-medium ${(t.pnl ?? 0) >= 0 ? "text-gain" : "text-loss"}`}>
                        {t.pnl === null ? "—" : `${t.pnl >= 0 ? "+" : ""}${(t.pnl / 1e6).toFixed(2)}tr`}
                        {pct !== null && <div className="text-[11px] text-muted">{`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}</div>}
                      </td>
                      <td className="p-3 text-muted">{EXIT[t.exitReason ?? ""] ?? t.exitReason ?? "—"}</td>
                      <td className="num p-3 whitespace-nowrap text-muted">
                        {d(t.openedAt)} → {d(t.closedAt)}
                      </td>
                      <td className="p-3">
                        <TradeActions
                          t={{
                            id: t.id,
                            ticker: t.symbol.ticker,
                            qty: t.qty,
                            entry: t.entryPrice,
                            stop: t.stopPrice,
                            target: t.targetPrice,
                            exit: t.exitPrice,
                            status: t.status,
                            note: t.note,
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {orders.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold">Lệnh đặt qua TCBS</h2>
          <div className="card overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="p-3 font-medium">Mã</th>
                  <th className="p-3 font-medium">Chiều</th>
                  <th className="p-3 text-right font-medium">SL</th>
                  <th className="p-3 text-right font-medium">Giá</th>
                  <th className="p-3 font-medium">Loại</th>
                  <th className="p-3 font-medium">Trạng thái</th>
                  <th className="p-3 font-medium">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-border/50 last:border-0">
                    <td className="p-3 font-semibold">{o.signal?.symbol.ticker ?? "—"}</td>
                    <td className={`p-3 font-medium ${o.side === "BUY" ? "text-gain" : "text-loss"}`}>{o.side === "BUY" ? "Mua" : "Bán"}</td>
                    <td className="num p-3 text-right">{o.qty.toLocaleString("en-US")}</td>
                    <td className="num p-3 text-right">{px(o.price)}</td>
                    <td className="p-3 text-muted">
                      {o.type} · {o.mode === "paper" ? "tiền ảo" : "thật"}
                    </td>
                    <td className="p-3 text-muted">{o.status}</td>
                    <td className="num p-3 text-muted">{o.placedAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: number }) {
  const cls = !tone ? "" : tone > 0 ? "text-gain" : "text-loss";
  return (
    <div className="card p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`num mt-1 font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
