import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { vnToday } from "@/lib/vn-time";
import { getBool, getNum, getSetting } from "@/lib/settings";
import { positionsReport } from "@/lib/report/positions";
import { vn30Snapshot } from "@/lib/analysis/vn30";
import SignalTable from "./components/SignalTable";
import NavEditor from "./components/NavEditor";

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
  const nav = await getNum("navVnd");
  const riskPct = await getNum("riskPct");
  const universe = await getSetting("universe");

  return (
    <main className="mx-auto max-w-5xl p-6 text-sm">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">VN Trading Assistant</h1>
        <nav className="flex gap-2 text-xs">
          {(["/signals", "/backtest", "/journal"] as const).map((h) => (
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

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Symbols" value={symbolCount.toLocaleString("en-US")} />
        <Stat label="Daily bars" value={barCount.toLocaleString("en-US")} />
        <Stat label="Data mới nhất" value={latestSignal?.date ?? "—"} />
        <Stat label="NAV" value={`${(nav / 1e6).toFixed(0)}tr`} />
      </div>

      <div className="mb-6 flex flex-wrap items-start gap-3">
        <div className="flex gap-2 text-xs">
          <Badge ok={scanEnabled}>scanner {scanEnabled ? "ON" : "OFF"}</Badge>
          <Badge ok={paper}>paper {paper ? "ON" : "OFF"}</Badge>
          <Badge ok={!kill}>{kill ? "🛑 kill ON" : "kill off"}</Badge>
        </div>
        <div className="grow">
          <NavEditor nav={nav} riskPct={riskPct} universe={universe} />
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
                    <td className="num p-3 text-right font-medium">{p.price ?? "?"}</td>
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
                    <td className="num p-3 text-right text-loss">{p.stop ?? "—"}</td>
                    <td className="num p-3 text-right text-gain">{p.target ?? "—"}</td>
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="num mt-1 text-lg font-semibold">{value}</div>
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
