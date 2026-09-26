import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getBool, getSetting } from "@/lib/settings";
import { positionsReport } from "@/lib/report/positions";
import { GUEST, currentUser } from "@/lib/user";
import { loadPortfolio } from "@/lib/report/portfolio";
import { vn30Snapshot } from "@/lib/analysis/vn30";
import { latestSignalDate } from "@/lib/signals";
import SignalTable from "./components/SignalTable";
import PositionsTable from "./components/PositionsTable";
import { AddTradeButton } from "./components/TradeActions";
import AutoRefresh from "./components/AutoRefresh";
import { LivePrice, PinQuotes } from "./components/live";
import OpportunityStatus from "./components/OpportunityStatus";
import { More } from "./components/More";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [sigDate, u] = await Promise.all([latestSignalDate(), currentUser().then((x) => x ?? GUEST)]);
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
    positionsReport(u.id),
    vn30Snapshot(),
    getBool("scanEnabled"),
    getBool("paperTrading"),
    getBool("killSwitch"),
    getSetting("universe"),
  ]);
  const pf = await loadPortfolio(positions, u);
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
        <h1 className="text-xl font-bold tracking-tight">Trang chủ</h1>
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
          sub={`${signed(pf.totalPct)}% so với vốn ${tr(pf.initial)}`}
          tone={pf.totalPnl}
        />
        <Stat
          label="Tiền mặt còn lại"
          value={tr(pf.cash)}
          sub={pf.cash < 0 ? "đã mua nhiều hơn vốn khai báo" : "còn để mua thêm"}
          tone={pf.cash < 0 ? -1 : 0}
        />
        <Stat
          label="Cổ phiếu đang giữ"
          value={tr(pf.marketValue)}
          sub={`mua vào ${tr(pf.invested)}`}
        />
        <Stat
          label="Tổng lãi/lỗ"
          value={trSigned(pf.totalPnl)}
          sub={pf.dayPnl === null ? "đã chốt + đang giữ" : `hôm nay ${trSigned(pf.dayPnl)}`}
          tone={pf.totalPnl}
        />
      </div>
      {pf.cash < 0 && (
        <p className="card mb-2 border-loss/40 p-3 text-xs text-loss">
          Tiền mặt âm {tr(pf.cash)}. Sửa vốn ban đầu ở Cài đặt cho đủ số đã bỏ ra (ít nhất {Math.ceil((pf.invested - pf.realized) / 1e6)}tr) thì lãi/lỗ mới đúng.
        </p>
      )}
      <div className="mb-4">
        <More label="Số lệnh đã đóng, tỷ lệ thắng">
          <div className="card flex flex-wrap gap-x-6 gap-y-1 p-3 text-xs text-muted">
            <span>Đã đóng <b className="num text-foreground">{pf.closedCount}</b></span>
            <span>Thắng <b className="num text-foreground">{pf.winRate === null ? "—" : `${pf.wins}/${pf.closedCount} (${pf.winRate.toFixed(0)}%)`}</b></span>
            <span>Lãi TB <b className="num text-gain">{pf.avgWin === null ? "—" : trSigned(pf.avgWin)}</b></span>
            <span>Lỗ TB <b className="num text-loss">{pf.avgLoss === null ? "—" : trSigned(pf.avgLoss)}</b></span>
            {pf.best && pf.best.pnl > 0 && <span>Tốt nhất <b className="text-foreground">{pf.best.ticker}</b> <b className="num text-gain">{trSigned(pf.best.pnl)}</b></span>}
            {pf.worst && pf.worst.pnl < 0 && <span>Tệ nhất <b className="text-foreground">{pf.worst.ticker}</b> <b className="num text-loss">{trSigned(pf.worst.pnl)}</b></span>}
            <span>Nến mới nhất <span className="num">{latestBar?.date ?? "—"}</span> · {symbolCount.toLocaleString("en-US")} mã</span>
          </div>
        </More>
      </div>

      <section className="mb-8">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Vị thế đang giữ</h2>
          <AddTradeButton />
        </div>
        <PositionsTable positions={positions} />
      </section>

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
            {latestSignals.length ? "Đã xử lý hết tín hiệu mới." : "Chưa có tín hiệu mới."}
          </p>
        ) : (
          <SignalTable signals={pending.slice(0, 12)} showDate={false} latestSession={sigDate} />
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">VN30 — đang theo dõi, chưa phải lệnh mua</h2>
        <PinQuotes tickers={vn30.slice(0, 12).map((r) => r.ticker)} />
        <div className="flex flex-col gap-2 sm:hidden">
          {vn30.slice(0, 12).map((r) => (
            <div key={r.ticker} className="card p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/stock/${r.ticker}`} className="text-sm font-semibold hover:text-accent">
                    {r.ticker}
                  </Link>{" "}
                  <span>{r.setup}</span>
                </div>
                <LivePrice
                  ticker={r.ticker}
                  fallback={r.close}
                  refPrice={r.chgPct !== null ? r.close / (1 + r.chgPct / 100) : null}
                />
              </div>
              <div className="num mt-2 grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[10px] text-muted">Vùng mua</div>
                  {r.buyZone ? `${r.buyZone[0].toFixed(2)}–${r.buyZone[1].toFixed(2)}` : "—"}
                </div>
                <div>
                  <div className="text-[10px] text-muted">Cắt lỗ</div>
                  <span className="text-loss">{r.stop?.toFixed(2) ?? "—"}</span>
                </div>
                <div>
                  <div className="text-[10px] text-muted">Chốt lời</div>
                  <span className="text-gain">{r.target?.toFixed(2) ?? "—"}</span>
                </div>
              </div>
              {(r.plain || r.note) && !(r.buyZone && r.stop && r.target) && (
                <More label="Vì sao theo dõi">
                  {r.plain && <p className="text-[11px]">{r.plain}</p>}
                  {r.note && <p className="text-[11px] text-muted">{r.note}</p>}
                </More>
              )}
              {r.buyZone && r.stop && r.target && (
                <OpportunityStatus
                  ticker={r.ticker}
                  date={r.dataDate}
                  latestSession={sigDate}
                  buyZone={r.buyZone}
                  stop={r.stop}
                  target={r.target}
                  trigger={r.trigger}
                  extra={(r.plain || r.note) && (
                    <>
                      {r.plain && <p className="text-[11px]">{r.plain}</p>}
                      {r.note && <p className="text-[11px] text-muted">{r.note}</p>}
                    </>
                  )}
                />
              )}
            </div>
          ))}
        </div>
        <div className="card hidden overflow-x-auto sm:block">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="p-3 font-medium">Mã</th>
                <th className="p-3 font-medium">Setup</th>
                <th className="p-3 text-right font-medium" colSpan={2}>
                  Giá (%)
                </th>
                <th className="p-3 text-right font-medium">Vùng mua</th>
                <th className="p-3 text-right font-medium">Cắt lỗ</th>
                <th className="p-3 text-right font-medium">Chốt lời</th>
                <th className="p-3 font-medium">Việc cần làm</th>
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
                  <td className="p-3">
                    {r.buyZone && r.stop && r.target ? (
                      <OpportunityStatus
                        ticker={r.ticker}
                        date={r.dataDate}
                        latestSession={sigDate}
                        buyZone={r.buyZone}
                        stop={r.stop}
                        target={r.target}
                        trigger={r.trigger}
                        extra={(r.plain || r.note) && (
                          <>
                            {r.plain && <p className="text-[11px]">{r.plain}</p>}
                            {r.note && <p className="text-[11px] text-muted">{r.note}</p>}
                          </>
                        )}
                      />
                    ) : (r.plain || r.note) && (
                      <More label="Vì sao theo dõi">
                        {r.plain && <p className="text-[11px]">{r.plain}</p>}
                        {r.note && <p className="text-[11px] text-muted">{r.note}</p>}
                      </More>
                    )}
                  </td>
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
