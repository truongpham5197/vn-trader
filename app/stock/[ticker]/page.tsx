import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { scoreSetup } from "@/lib/analysis/vn30";
import { currentSectorStrength } from "@/lib/analysis/sector-live";
import { GUEST, currentUser } from "@/lib/user";
import { netPnlPct } from "@/lib/fees";
import { px } from "@/lib/format";
import type { Bar } from "@/lib/data/types";
import { LiveBadge, LivePrice } from "../../components/live";
import { StockFundamentals, WatchButton } from "../../components/StockActions";
import PriceChart from "../../components/PriceChart";

export const dynamic = "force-dynamic";

const dong = (p: number) => `${Math.round(p * 1000).toLocaleString("vi-VN")}đ`;
const sg = (v: number | null) =>
  v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const tone = (v: number | null) =>
  v === null ? "" : v >= 0 ? "text-gain" : "text-loss";
const avg = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const ret = (c: number[], k: number) =>
  c.length > k ? (c.at(-1)! / c[c.length - 1 - k] - 1) * 100 : null;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  return { title: `${(await params).ticker.toUpperCase()} — vn-trader` };
}

function Stat({
  label,
  value,
  cls = "",
}: {
  label: string;
  value: React.ReactNode;
  cls?: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={`num font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

export default async function StockPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const ticker = (await params).ticker.toUpperCase();
  const sym = await prisma.symbol.findUnique({ where: { ticker } });
  if (!sym) notFound();
  const u = (await currentUser()) ?? GUEST;

  const [desc, signals, trades, position, watchlist, sectors] =
    await Promise.all([
      prisma.dailyBar.findMany({
        where: { symbolId: sym.id },
        orderBy: { date: "desc" },
        take: 130,
      }),
      prisma.signal.findMany({
        where: { symbolId: sym.id },
        orderBy: { date: "desc" },
        take: 5,
        include: { strategy: { select: { name: true } } },
      }),
      prisma.trade.findMany({ where: { symbolId: sym.id, status: "open", userId: u.id } }),
      u.owner ? prisma.position.findUnique({ where: { symbolId: sym.id } }) : null,
      u.watchlist,
      currentSectorStrength().catch(() => null),
    ]);
  const bars: Bar[] = desc
    .reverse()
    .map((r) => ({
      date: r.date,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
    }));
  const closes = bars.map((b) => b.close);
  const last = bars.at(-1);
  const prev = bars.at(-2);
  const setup =
    bars.length >= 60 ? scoreSetup(ticker, sym.sector, bars.slice(-60)) : null;
  const ma20 = closes.length >= 20 ? avg(closes.slice(-20)) : null;
  const ma50 = closes.length >= 50 ? avg(closes.slice(-50)) : null;
  const value20 = avg(desc.slice(-20).map((r) => r.value));
  const hi52 = bars.length ? Math.max(...bars.map((b) => b.high)) : null;
  const lo52 = bars.length ? Math.min(...bars.map((b) => b.low)) : null;
  const sector = sectors?.sectors.find((s) => s.sector === sym.sector) ?? null;
  const ranked = sectors?.sectors.filter((s) => s.rank !== null).length ?? 0;
  const pick = sector?.picks.find((p) => p.ticker === ticker) ?? null;

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl space-y-5 p-4 text-sm sm:p-6">
      <section className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">
              {ticker}{" "}
              <span className="text-sm font-normal text-muted">
                {sym.exchange}
              </span>
            </h1>
            <div className="text-sm text-muted">{sym.companyName ?? "—"}</div>
            <div className="mt-0.5 text-xs text-muted">
              {sym.sector ?? "Chưa rõ ngành"} · biên độ ±
              {(sym.bandPct * 100).toFixed(0)}%
              {!sym.active && " · không còn giao dịch"}
            </div>
          </div>
          <div className="text-right">
            <LivePrice
              ticker={ticker}
              fallback={last?.close ?? null}
              refPrice={prev?.close ?? null}
              unit="dong"
              className="text-2xl font-bold"
            />
            <div className="mt-1 flex items-center justify-end gap-2">
              <LiveBadge />
              <WatchButton
                ticker={ticker}
                watched={watchlist.includes(ticker)}
              />
            </div>
          </div>
        </div>
        {bars.length > 20 ? (
          <>
            <div className="mt-3">
              <PriceChart points={bars.map((b) => ({ date: b.date, close: b.close }))} />
              <div className="flex justify-between text-xs text-muted">
                <span>{bars[0].date}</span>
                <span>— giá đóng cửa · - - trung bình 20 phiên</span>
                <span>{last!.date}</span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              <Stat
                label="1 tuần"
                value={sg(ret(closes, 5))}
                cls={tone(ret(closes, 5))}
              />
              <Stat
                label="1 tháng"
                value={sg(ret(closes, 20))}
                cls={tone(ret(closes, 20))}
              />
              <Stat
                label="3 tháng"
                value={sg(ret(closes, 60))}
                cls={tone(ret(closes, 60))}
              />
              <Stat
                label="6 tháng"
                value={sg(ret(closes, 120))}
                cls={tone(ret(closes, 120))}
              />
              <Stat
                label="TB 20 phiên"
                value={ma20 ? dong(ma20) : "—"}
                cls={ma20 && last!.close >= ma20 ? "text-gain" : "text-loss"}
              />
              <Stat
                label="TB 50 phiên"
                value={ma50 ? dong(ma50) : "—"}
                cls={ma50 && last!.close >= ma50 ? "text-gain" : "text-loss"}
              />
              <Stat
                label={`Cao/thấp ${bars.length} phiên`}
                value={hi52 && lo52 ? `${px(lo52)}–${px(hi52)}` : "—"}
              />
              <Stat
                label="GTGD TB 20 phiên"
                value={`${(value20 / 1e9).toFixed(1)} tỷ`}
                cls={value20 < 5e9 ? "text-amber-300" : ""}
              />
            </div>
            {value20 < 5e9 && (
              <p className="mt-2 text-xs text-amber-300">
                ⚠️ Thanh khoản thấp (&lt; 5 tỷ/phiên) — khó mua/bán khối lượng
                lớn, scan bỏ qua mã này.
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Chưa đủ dữ liệu giá trong hệ thống ({bars.length} phiên).
          </p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-4 text-sm">
          <h2 className="mb-2 font-semibold">
            📈 Nhận định kỹ thuật{" "}
            {setup && <span className="text-accent">— {setup.setup}</span>}
          </h2>
          {setup ? (
            <>
              <p className="leading-relaxed">{setup.plain}</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-muted">
                {setup.facts.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
              {setup.buyZone && setup.stop && setup.target && (
                <dl className="num mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted">Vùng mua</dt>
                    <dd className="font-semibold">
                      {dong(setup.buyZone[0])} – {dong(setup.buyZone[1])}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Cắt lỗ</dt>
                    <dd className="text-loss">{dong(setup.stop)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Chốt lời</dt>
                    <dd className="text-gain">{dong(setup.target)}</dd>
                  </div>
                </dl>
              )}
            </>
          ) : (
            <p className="text-muted">
              Chưa đủ 60 phiên dữ liệu để chấm setup.
            </p>
          )}
        </section>

        <section className="card p-4 text-sm">
          <h2 className="mb-2 font-semibold">🏭 Ngành {sym.sector ?? "—"}</h2>
          {sector ? (
            <>
              <p className="leading-relaxed">{sector.summary}</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-muted">
                {sector.why.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              {pick ? (
                <p className="mt-2 text-xs text-gain">
                  ✅ {ticker} đang nằm trong danh sách gợi ý của ngành.
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted">
                  {ticker} chưa có setup mua trong bảng ngành.
                </p>
              )}
              <Link
                href="/sectors"
                className="mt-1 inline-block text-xs text-accent hover:underline"
              >
                Xem bảng xếp hạng {ranked} ngành →
              </Link>
            </>
          ) : (
            <p className="text-muted">
              Mã không nằm trong bảng xếp hạng ngành (thanh khoản thấp hoặc chưa
              phân ngành).
            </p>
          )}
        </section>
      </div>

      {(trades.length > 0 || position) && (
        <section className="card p-4 text-sm">
          <h2 className="mb-2 font-semibold">💼 Vị thế của bạn</h2>
          {position && (
            <p className="text-xs text-muted">
              TCBS: {position.qty.toLocaleString("vi-VN")} cp (bán được{" "}
              {position.sellableQty.toLocaleString("vi-VN")}), giá vốn{" "}
              {dong(position.avgPrice)}
            </p>
          )}
          {trades.map((t) => (
            <p key={t.id} className="num text-xs">
              Lệnh #{t.id}: {t.qty.toLocaleString("vi-VN")} cp @{" "}
              {dong(t.entryPrice)}
              {t.stopPrice && ` · cắt lỗ ${dong(t.stopPrice)}`}
              {t.targetPrice && ` · chốt ${dong(t.targetPrice)}`}
              {last && (
                <span
                  className={`ml-1 ${tone(netPnlPct(t.entryPrice, last.close))}`}
                >
                  ({sg(netPnlPct(t.entryPrice, last.close))} theo giá đóng cửa,
                  sau phí)
                </span>
              )}
            </p>
          ))}
          <Link
            href="/journal"
            className="mt-1 inline-block text-xs text-accent hover:underline"
          >
            Quản lý ở Nhật ký →
          </Link>
        </section>
      )}

      {signals.length > 0 && (
        <section className="card overflow-x-auto p-4 text-sm">
          <h2 className="mb-2 font-semibold">🔔 Tín hiệu gần đây</h2>
          <table className="num w-full text-xs">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1 pr-3">Ngày nến</th>
                <th className="pr-3">Chiến lược</th>
                <th className="pr-3">Mua</th>
                <th className="pr-3">Cắt lỗ</th>
                <th className="pr-3">Chốt lời</th>
                <th className="pr-3">Trạng thái</th>
                <th>Lý do</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((s) => (
                <tr key={s.id} className="border-t border-border/60 align-top">
                  <td className="py-1 pr-3">{s.date}</td>
                  <td className="pr-3">{s.strategy.name}</td>
                  <td className="pr-3">{px(s.entry)}</td>
                  <td className="pr-3 text-loss">{px(s.stop)}</td>
                  <td className="pr-3 text-gain">{px(s.target)}</td>
                  <td className="pr-3">{s.status}</td>
                  <td className="min-w-64 text-muted">{s.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">
          🏢 Kinh doanh &amp; tin tức
        </h2>
        <StockFundamentals ticker={ticker} />
      </section>

      <p className="text-xs text-muted">
        ⚠️ Nhận định tự động từ giá + khối lượng; số liệu kinh doanh/tin chỉ để
        tham khảo, không phải khuyến nghị. Chưa chiến lược nào chứng minh được
        lợi thế — mục tiêu +5% là mục tiêu, không phải cam kết.
      </p>
    </main>
  );
}
