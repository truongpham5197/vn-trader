import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { vnToday } from "@/lib/vn-time";
import { getBool, getNum, getSetting } from "@/lib/settings";
import { positionsReport } from "@/lib/report/positions";
import { loadPortfolio } from "@/lib/report/portfolio";
import { vn30Snapshot } from "@/lib/analysis/vn30";
import SignalTable from "./components/SignalTable";
import SettingsPanel from "./components/SettingsPanel";
import { px } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const today = vnToday();
  const [symbolCount, barCount, todaySignals, latestSignal, positions, orders, vn30] =
    await Promise.all([
      prisma.symbol.count({ where: { active: true } }),
      prisma.dailyBar.count(),
      prisma.signal.findMany({
        where: { date: today },
        include: { symbol: true, strategy: true },
        orderBy: { id: "desc" },
      }),
      prisma.dailyBar.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
      positionsReport(),
      prisma.order.findMany({
        orderBy: { id: "desc" },
        take: 10,
        include: { signal: { include: { symbol: true } } },
      }),
      vn30Snapshot(),
    ]);
  const [scanEnabled, paper, kill] = await Promise.all([
    getBool("scanEnabled"),
    getBool("paperTrading"),
    getBool("killSwitch"),
  ]);
  const pf = await loadPortfolio(positions);
  const nav = pf.initial;
  const riskPct = await getNum("riskPct");
  const universe = await getSetting("universe");
  const minValue = await getNum("universeMinValueVnd");

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl p-4 text-sm sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">VN Trading Assistant</h1>
        <nav className="flex flex-wrap gap-2 text-xs">
          {(["/signals", "/sectors", "/backtest", "/journal"] as const).map((h) => (
            <Link
              key={h}
              href={h}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-muted transition-colors hover:border-accent hover:text-foreground"
            >
              {h.slice(1)}
            </Link>
          ))}
        </nav>
      </div>

      {/* Tài sản — NAV tự tính từ vốn ban đầu + lãi/lỗ đã chốt + giá CP đang giữ */}
      <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Tổng tài sản (NAV)"
          value={tr(pf.nav)}
          sub={`${signed(pf.totalPct)}% so với vốn ${(pf.initial / 1e6).toFixed(0)}tr`}
          tone={pf.totalPnl}
        />
        <Stat label="Tiền mặt" value={tr(pf.cash)} sub={`Cổ phiếu ${tr(pf.marketValue)}`} />
        <Stat
          label="Lãi/lỗ hôm nay"
          value={pf.dayPnl === null ? "—" : trSigned(pf.dayPnl)}
          sub="theo giá CP đang giữ"
          tone={pf.dayPnl ?? 0}
        />
        <Stat
          label="Tổng lãi/lỗ"
          value={trSigned(pf.totalPnl)}
          sub={`Đã chốt ${trSigned(pf.realized)} · đang giữ ${trSigned(pf.unrealized)}`}
          tone={pf.totalPnl}
        />
      </div>
      {pf.cash < 0 && (
        <p className="card mb-2 border-loss/40 p-3 text-xs text-loss">
          ⚠️ Tiền mặt âm: cổ phiếu đang giữ ({tr(pf.marketValue)}) vượt vốn ban đầu ({tr(pf.initial)}). Hãy tăng
          &quot;Vốn ban đầu&quot; ở phần Cấu hình cho đúng số tiền thật bạn bỏ ra, để NAV và cỡ lệnh gợi ý chính xác.
        </p>
      )}
      <div className="card mb-4 flex flex-wrap gap-x-6 gap-y-1 p-3 text-xs text-muted">
        <span>
          Lệnh đã đóng <b className="num text-foreground">{pf.closedCount}</b>
        </span>
        <span>
          Tỷ lệ thắng{" "}
          <b className="num text-foreground">
            {pf.winRate === null ? "—" : `${pf.wins}/${pf.closedCount} (${pf.winRate.toFixed(0)}%)`}
          </b>
        </span>
        <span>
          Lãi TB/lệnh thắng <b className="num text-gain">{pf.avgWin === null ? "—" : trSigned(pf.avgWin)}</b>
        </span>
        <span>
          Lỗ TB/lệnh thua <b className="num text-loss">{pf.avgLoss === null ? "—" : trSigned(pf.avgLoss)}</b>
        </span>
        {pf.best && pf.best.pnl > 0 && (
          <span>
            Tốt nhất <b className="text-foreground">{pf.best.ticker}</b> <b className="num text-gain">{trSigned(pf.best.pnl)}</b>
          </span>
        )}
        {pf.worst && pf.worst.pnl < 0 && (
          <span>
            Tệ nhất <b className="text-foreground">{pf.worst.ticker}</b> <b className="num text-loss">{trSigned(pf.worst.pnl)}</b>
          </span>
        )}
        <span className="ml-auto">
          Dữ liệu {symbolCount.toLocaleString("en-US")} mã · {barCount.toLocaleString("en-US")} nến · mới nhất{" "}
          {latestSignal?.date ?? "—"}
        </span>
      </div>

      <div className="mb-6 flex flex-wrap items-start gap-3">
        <div className="flex gap-2 text-xs">
          <Badge ok={scanEnabled}>scanner {scanEnabled ? "ON" : "OFF"}</Badge>
          <Badge ok={paper}>paper {paper ? "ON" : "OFF"}</Badge>
          <Badge ok={!kill}>{kill ? "🛑 kill ON" : "kill off"}</Badge>
        </div>
        <div className="grow">
          <SettingsPanel
            nav={nav}
            riskPct={riskPct}
            universe={universe}
            minValue={minValue}
            scanEnabled={scanEnabled}
            kill={kill}
            paper={paper}
          />
        </div>
      </div>

      {/* Vị thế đang giữ — giá live nến 1m */}
      <section className="mb-6">
        <h2 className="mb-2 font-semibold">Vị thế đang giữ</h2>
        {positions.length === 0 ? (
          <p className="card p-4 text-muted">
            Chưa có vị thế. Log bằng <code className="num">/add MÃ &lt;sl&gt; &lt;giá&gt;</code> trong Telegram.
          </p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="p-3 font-medium">Mã</th>
                  <th className="p-3 text-right font-medium">SL</th>
                  <th className="p-3 text-right font-medium">Giá vốn</th>
                  <th className="p-3 text-right font-medium">Giá hiện tại</th>
                  <th className="p-3 text-right font-medium">P&L</th>
                  <th className="p-3 text-right font-medium">Hôm nay</th>
                  <th className="p-3 text-right font-medium">Stop</th>
                  <th className="p-3 text-right font-medium">Target</th>
                  <th className="p-3 font-medium">T+</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr
                    key={p.ticker}
                    className="border-b border-border/50 last:border-0 hover:bg-white/[0.03]"
                  >
                    <td className="p-3 font-semibold">{p.ticker}</td>
                    <td className="num p-3 text-right">{p.qty.toLocaleString("en-US")}</td>
                    <td className="num p-3 text-right">{p.entry.toFixed(2)}</td>
                    <td className="num p-3 text-right font-medium">{px(p.price, "?")}</td>
                    <td
                      className={`num p-3 text-right font-medium ${
                        (p.pnlPct ?? 0) >= 0 ? "text-gain" : "text-loss"
                      }`}
                    >
                      {p.pnlPct !== null ? `${p.pnlPct >= 0 ? "+" : ""}${p.pnlPct.toFixed(2)}%` : "?"}
                      {p.pnlVnd !== null && (
                        <span className="text-muted"> {p.pnlVnd >= 0 ? "+" : ""}{(p.pnlVnd / 1e6).toFixed(1)}tr</span>
                      )}
                    </td>
                    <td
                      className={`num p-3 text-right ${
                        (p.dayPct ?? 0) >= 0 ? "text-gain" : "text-loss"
                      }`}
                    >
                      {p.dayPct !== null ? `${p.dayPct >= 0 ? "+" : ""}${p.dayPct.toFixed(2)}%` : "?"}
                    </td>
                    <td className="num p-3 text-right text-loss">{px(p.stop)}</td>
                    <td className="num p-3 text-right text-gain">{px(p.target)}</td>
                    <td className="p-3 text-muted">
                      {p.sessionsHeld >= 2 ? "✓ bán được" : `⏳T+${p.sessionsHeld}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* VN30 watchlist — gợi ý vị thế tốt */}
      <section className="mb-6">
        <h2 className="mb-2 font-semibold">VN30 — setup đáng chú ý</h2>
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="p-3 font-medium">Mã</th>
                <th className="p-3 font-medium">Setup</th>
                <th className="p-3 text-right font-medium">Giá</th>
                <th className="p-3 text-right font-medium">%</th>
                <th className="p-3 text-right font-medium">Vùng mua</th>
                <th className="p-3 text-right font-medium">Stop</th>
                <th className="p-3 text-right font-medium">Target</th>
                <th className="p-3 font-medium">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {vn30.slice(0, 12).map((r) => (
                <tr
                  key={r.ticker}
                  className="border-b border-border/50 last:border-0 hover:bg-white/[0.03]"
                >
                  <td className="p-3 font-semibold">{r.ticker}</td>
                  <td className="p-3">{r.setup}</td>
                  <td className="num p-3 text-right">{r.close.toFixed(2)}</td>
                  <td
                    className={`num p-3 text-right ${
                      (r.chgPct ?? 0) >= 0 ? "text-gain" : "text-loss"
                    }`}
                  >
                    {r.chgPct !== null ? `${r.chgPct >= 0 ? "+" : ""}${r.chgPct.toFixed(1)}%` : "—"}
                  </td>
                  <td className="num p-3 text-right">
                    {r.buyZone ? `${r.buyZone[0].toFixed(2)}–${r.buyZone[1].toFixed(2)}` : "—"}
                  </td>
                  <td className="num p-3 text-right text-loss">{r.stop?.toFixed(2) ?? "—"}</td>
                  <td className="num p-3 text-right text-gain">{r.target?.toFixed(2) ?? "—"}</td>
                  <td className="p-3 text-muted">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Lệnh gần đây */}
      <section className="mb-6">
        <h2 className="mb-2 font-semibold">Lệnh gần đây</h2>
        {orders.length === 0 ? (
          <p className="card p-4 text-muted">Chưa có lệnh nào.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="p-3 font-medium">#</th>
                  <th className="p-3 font-medium">Mã</th>
                  <th className="p-3 font-medium">Side</th>
                  <th className="p-3 text-right font-medium">SL đặt</th>
                  <th className="p-3 text-right font-medium">Giá</th>
                  <th className="p-3 text-right font-medium">Giá trị</th>
                  <th className="p-3 font-medium">Loại</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Lệnh TCBS</th>
                  <th className="p-3 font-medium">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-border/50 last:border-0 hover:bg-white/[0.03]"
                  >
                    <td className="num p-3 text-muted">{o.id}</td>
                    <td className="p-3 font-semibold">{o.signal?.symbol.ticker ?? "—"}</td>
                    <td className={`p-3 font-medium ${o.side === "BUY" ? "text-gain" : "text-loss"}`}>
                      {o.side}
                    </td>
                    <td className="num p-3 text-right">{o.qty.toLocaleString("en-US")}</td>
                    <td className="num p-3 text-right">{o.price.toFixed(2)}</td>
                    <td className="num p-3 text-right text-muted">
                      {((o.qty * o.price * 1000) / 1e6).toFixed(1)}tr
                    </td>
                    <td className="p-3 text-muted">
                      {o.type} · {o.mode}
                    </td>
                    <td
                      className={`p-3 font-medium ${
                        o.status === "filled"
                          ? "text-gain"
                          : o.status === "rejected" || o.status === "cancelled"
                            ? "text-loss"
                            : "text-accent"
                      }`}
                    >
                      {o.status}
                    </td>
                    <td className="num p-3 text-muted">{o.tcbsOrderId ?? "—"}</td>
                    <td className="num p-3 text-muted">
                      {o.placedAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">
          Tín hiệu hôm nay <span className="num text-muted">{today}</span> — {todaySignals.length}
        </h2>
        <Link href="/signals" className="text-accent hover:underline">
          tất cả →
        </Link>
      </div>

      {todaySignals.length === 0 ? (
        <p className="card p-4 text-muted">Chưa có tín hiệu. Cron scan chạy 15:40 T2–T6.</p>
      ) : (
        <SignalTable signals={todaySignals} />
      )}
    </main>
  );
}

const tr = (v: number) => `${(v / 1e6).toFixed(2)}tr`;
const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
const trSigned = (v: number) => `${v >= 0 ? "+" : ""}${tr(v)}`;

function Stat({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: number }) {
  const cls = tone === undefined || tone === 0 ? "" : tone > 0 ? "text-gain" : "text-loss";
  return (
    <div className="card p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`num mt-1 text-lg font-semibold ${cls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-md border px-2 py-1 font-medium ${
        ok ? "border-gain/30 bg-gain/10 text-gain" : "border-loss/30 bg-loss/10 text-loss"
      }`}
    >
      {children}
    </span>
  );
}
