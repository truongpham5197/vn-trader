import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getBool, getSetting } from "@/lib/settings";
import { positionsReport } from "@/lib/report/positions";
import { loadPortfolio } from "@/lib/report/portfolio";
import { vn30Snapshot } from "@/lib/analysis/vn30";
import { latestSignalDate } from "@/lib/signals";
import SignalTable from "./components/SignalTable";
import PositionsTable from "./components/PositionsTable";
import { AddTradeButton } from "./components/TradeActions";
import AutoRefresh from "./components/AutoRefresh";
import { LivePrice } from "./components/live";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sigDate = await latestSignalDate();
  const [
    symbolCount,
    latestBar,
    latestSignals,
    positions,
    vn30,
    scanEnabled,
    paper,
    kill,
    universe,
  ] = await Promise.all([
    prisma.symbol.count({ where: { active: true } }),
    prisma.dailyBar.findFirst({
      orderBy: { date: "desc" },
      select: { date: true },
    }),
    sigDate
      ? prisma.signal.findMany({
          where: { date: sigDate },
          include: { symbol: true, strategy: true },
          orderBy: [{ rr: "desc" }, { id: "desc" }],
        })
      : [],
    positionsReport(),
    vn30Snapshot(),
    getBool("scanEnabled"),
    getBool("paperTrading"),
    getBool("killSwitch"),
    getSetting("universe"),
  ]);
  const pf = await loadPortfolio(positions);
  const pending = latestSignals.filter(
    (s) => s.status === "new" || s.status === "notified",
  );
  const UNIVERSE: Record<string, string> = {
    vn30: "VN30",
    liquid: "mã thanh khoản",
    all: "toàn thị trường",
  };

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl p-4 text-sm sm:p-6">
      <AutoRefresh />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">Tổng quan</h1>
        <Link
          href="/settings"
          className="flex flex-wrap gap-2 text-xs"
          title="Đổi ở trang Cài đặt"
        >
          <Badge ok={scanEnabled && !kill}>
            {kill
              ? "🛑 Kill switch BẬT"
              : scanEnabled
                ? "● Đang quét"
                : "⏸ Tắt quét"}
          </Badge>
          <Badge ok={paper}>{paper ? "Tiền ảo" : "TIỀN THẬT"}</Badge>
          <span className="rounded-md border border-border px-2 py-1 text-muted">
            Phạm vi: {UNIVERSE[universe] ?? universe}
          </span>
        </Link>
      </div>

      {/* Tài sản — NAV tự tính từ vốn ban đầu + lãi/lỗ đã chốt + giá CP đang giữ */}
      <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Tổng tài sản"
          value={tr(pf.nav)}
          sub={`= tiền mặt + cổ phiếu (nếu bán hết hôm nay) · ${signed(pf.totalPct)}% so với vốn ${tr(pf.initial)}`}
          tone={pf.totalPnl}
        />
        <Stat
          label="Tiền mặt còn lại"
          value={tr(pf.cash)}
          sub={`Vốn ${tr(pf.initial)} − đã mua CP ${tr(pf.invested)} (gồm phí)${pf.realized ? ` ${trSigned(pf.realized)} lãi/lỗ đã chốt` : ""}`}
          tone={pf.cash < 0 ? -1 : 0}
        />
        <Stat
          label="Cổ phiếu đang giữ"
          value={tr(pf.marketValue)}
          sub={`Giá trị theo giá hiện tại · mua vào ${tr(pf.invested)}`}
        />
        <Stat
          label="Tổng lãi/lỗ"
          value={trSigned(pf.totalPnl)}
          sub={`Đã bán chốt ${trSigned(pf.realized)} · đang giữ (tạm tính) ${trSigned(pf.unrealized)}${pf.dayPnl === null ? "" : ` · riêng hôm nay ${trSigned(pf.dayPnl)}`}`}
          tone={pf.totalPnl}
        />
      </div>
      {pf.cash < 0 && (
        <p className="card mb-2 border-loss/40 p-3 text-xs text-loss">
          ⚠️ Tiền mặt âm {tr(pf.cash)}: số tiền đã mua cổ phiếu (
          {tr(pf.invested)}, gồm phí 0,15%) lớn hơn vốn ban đầu (
          {tr(pf.initial)}) — tức là bạn đã mua nhiều hơn số vốn khai báo. Sửa
          &quot;Vốn ban đầu&quot; ở phần Cấu hình cho đúng số tiền thật bạn bỏ
          ra (ít nhất {Math.ceil((pf.invested - pf.realized) / 1e6)}tr) để số
          liệu chính xác.
        </p>
      )}
      <div className="card mb-4 flex flex-wrap gap-x-6 gap-y-1 p-3 text-xs text-muted">
        <span>
          Lệnh đã đóng <b className="num text-foreground">{pf.closedCount}</b>
        </span>
        <span>
          Tỷ lệ thắng{" "}
          <b className="num text-foreground">
            {pf.winRate === null
              ? "—"
              : `${pf.wins}/${pf.closedCount} (${pf.winRate.toFixed(0)}%)`}
          </b>
        </span>
        <span>
          Lãi TB/lệnh thắng{" "}
          <b className="num text-gain">
            {pf.avgWin === null ? "—" : trSigned(pf.avgWin)}
          </b>
        </span>
        <span>
          Lỗ TB/lệnh thua{" "}
          <b className="num text-loss">
            {pf.avgLoss === null ? "—" : trSigned(pf.avgLoss)}
          </b>
        </span>
        {pf.best && pf.best.pnl > 0 && (
          <span>
            Tốt nhất <b className="text-foreground">{pf.best.ticker}</b>{" "}
            <b className="num text-gain">{trSigned(pf.best.pnl)}</b>
          </span>
        )}
        {pf.worst && pf.worst.pnl < 0 && (
          <span>
            Tệ nhất <b className="text-foreground">{pf.worst.ticker}</b>{" "}
            <b className="num text-loss">{trSigned(pf.worst.pnl)}</b>
          </span>
        )}
        <span className="ml-auto">
          Dữ liệu {symbolCount.toLocaleString("en-US")} mã · nến mới nhất{" "}
          <span className="num">{latestBar?.date ?? "—"}</span>
        </span>
      </div>

      {/* Tín hiệu lượt quét gần nhất — date = nến đã đóng, dùng cho phiên kế tiếp */}
      <section className="mb-8">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">
            Tín hiệu mới nhất{" "}
            {sigDate && (
              <span className="text-xs font-normal text-muted">
                nến <span className="num">{sigDate}</span> · {pending.length}{" "}
                chờ xử lý / {latestSignals.length}
              </span>
            )}
          </h2>
          <Link href="/signals" className="text-xs text-accent hover:underline">
            Xem tất cả →
          </Link>
        </div>
        {pending.length === 0 ? (
          <p className="card p-6 text-center text-muted">
            {latestSignals.length
              ? "Đã xử lý hết tín hiệu của lượt quét gần nhất."
              : "Chưa có tín hiệu."}{" "}
            Lượt quét kế tiếp chạy sau khi chốt nến (khoảng 15:10–17:00 T2–T6)
            và báo qua Telegram.
          </p>
        ) : (
          <SignalTable signals={pending.slice(0, 12)} showDate={false} />
        )}
      </section>

      <section className="mb-8">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Vị thế đang giữ</h2>
          <AddTradeButton />
        </div>
        <PositionsTable positions={positions} />
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
                <th className="p-3 text-right font-medium" colSpan={2}>
                  Giá (%)
                </th>
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
                  <td className="p-3 font-semibold">
                    <Link
                      href={`/stock/${r.ticker}`}
                      className="hover:text-accent"
                    >
                      {r.ticker}
                    </Link>
                  </td>
                  <td className="p-3">{r.setup}</td>
                  <td className="p-3 text-right" colSpan={2}>
                    <LivePrice
                      ticker={r.ticker}
                      fallback={r.close}
                      refPrice={
                        r.chgPct !== null
                          ? r.close / (1 + r.chgPct / 100)
                          : null
                      }
                    />
                  </td>
                  <td className="num p-3 text-right">
                    {r.buyZone
                      ? `${r.buyZone[0].toFixed(2)}–${r.buyZone[1].toFixed(2)}`
                      : "—"}
                  </td>
                  <td className="num p-3 text-right text-loss">
                    {r.stop?.toFixed(2) ?? "—"}
                  </td>
                  <td className="num p-3 text-right text-gain">
                    {r.target?.toFixed(2) ?? "—"}
                  </td>
                  <td className="p-3 text-muted">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

const tr = (v: number) => `${(v / 1e6).toFixed(2)}tr`;
const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
const trSigned = (v: number) => `${v >= 0 ? "+" : ""}${tr(v)}`;

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: number;
}) {
  const cls =
    tone === undefined || tone === 0
      ? ""
      : tone > 0
        ? "text-gain"
        : "text-loss";
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
        ok
          ? "border-gain/30 bg-gain/10 text-gain"
          : "border-loss/30 bg-loss/10 text-loss"
      }`}
    >
      {children}
    </span>
  );
}
