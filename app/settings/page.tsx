import { prisma } from "@/lib/prisma";
import { getBool, getNum, getSetting } from "@/lib/settings";
import { STRATEGIES, ensureStrategies } from "@/lib/strategy";
import { getWatchlist } from "@/lib/trades";
import SettingsPanel from "../components/SettingsPanel";
import { StrategyCard, WatchlistEditor } from "../components/SettingsEditors";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await ensureStrategies(prisma);
  const since = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10);
  const [strategies, counts, watchlist, nav, riskPct, universe, minValue, scanEnabled, kill, paper] = await Promise.all([
    prisma.strategy.findMany({ orderBy: { id: "asc" } }),
    prisma.signal.groupBy({ by: ["strategyId"], where: { date: { gte: since } }, _count: { _all: true } }),
    getWatchlist(),
    getNum("navVnd"),
    getNum("riskPct"),
    getSetting("universe"),
    getNum("universeMinValueVnd"),
    getBool("scanEnabled"),
    getBool("killSwitch"),
    getBool("paperTrading"),
  ]);

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl p-4 text-sm sm:p-6">
      <h1 className="mb-4 text-xl font-bold tracking-tight">Cài đặt</h1>

      <section className="mb-8">
        <h2 className="mb-2 font-semibold">Cấu hình chung</h2>
        <SettingsPanel
          nav={nav}
          riskPct={riskPct}
          universe={universe}
          minValue={minValue}
          scanEnabled={scanEnabled}
          kill={kill}
          paper={paper}
        />
      </section>

      <section className="mb-8">
        <h2 className="font-semibold">Chiến lược</h2>
        <p className="mt-1 mb-3 text-xs text-muted">
          Tắt chiến lược = ngừng tạo tín hiệu mới. Sửa tham số áp dụng từ lần quét kế tiếp — nên chạy lại Backtest trước khi đổi. Ô viền xanh =
          khác mặc định.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {strategies
            .filter((s) => STRATEGIES[s.type])
            .map((s) => (
              <StrategyCard
                key={s.id}
                s={{
                  id: s.id,
                  name: s.name,
                  type: s.type,
                  enabled: s.enabled,
                  defaults: STRATEGIES[s.type].defaults,
                  params: { ...STRATEGIES[s.type].defaults, ...(JSON.parse(s.params) as Record<string, number>) },
                  recent: counts.find((c) => c.strategyId === s.id)?._count._all ?? 0,
                }}
              />
            ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="font-semibold">Danh sách theo dõi</h2>
        <p className="mt-1 mb-3 text-xs text-muted">
          Mã trong danh sách luôn được quét tín hiệu mỗi ngày, kể cả khi không đạt ngưỡng thanh khoản / không thuộc phạm vi quét.
        </p>
        <WatchlistEditor tickers={watchlist} />
      </section>
    </main>
  );
}
