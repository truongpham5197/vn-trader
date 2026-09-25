import { prisma } from "@/lib/prisma";
import { getBool, getNum, getSetting } from "@/lib/settings";
import { GUEST, currentUser, userNum } from "@/lib/user";
import { STRATEGIES, ensureStrategies } from "@/lib/strategy";
import SettingsPanel from "../components/SettingsPanel";
import { StrategyCard, WatchlistEditor } from "../components/SettingsEditors";
import { AlertPrefs } from "../components/AlertCenter";
import PushSettings from "../components/PushSettings";
import { InstallCard } from "../components/InstallApp";
import { ThemeCard } from "../components/ThemeToggle";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await ensureStrategies(prisma);
  const u = (await currentUser()) ?? GUEST;
  const since = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10);
  const [strategies, counts, watchlist, nav, riskPct, universe, minValue, scanEnabled, learnEnabled, kill, paper] = await Promise.all([
    prisma.strategy.findMany({ orderBy: { id: "asc" } }),
    prisma.signal.groupBy({ by: ["strategyId"], where: { date: { gte: since } }, _count: { _all: true } }),
    u.watchlist,
    userNum(u, "navVnd"),
    userNum(u, "riskPct"),
    getSetting("universe"),
    getNum("universeMinValueVnd"),
    getBool("scanEnabled"),
    getBool("learnEnabled"),
    getBool("killSwitch"),
    getBool("paperTrading"),
  ]);

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl p-4 text-sm sm:p-6">
      <h1 className="mb-4 text-xl font-bold tracking-tight">Cài đặt</h1>

      <section className="mb-8">
        <h2 className="mb-2 font-semibold">Giao diện</h2>
        <ThemeCard />
      </section>

      <section className="mb-8">
        <h2 className="mb-2 font-semibold">Cấu hình chung</h2>
        <SettingsPanel
          nav={nav}
          riskPct={riskPct}
          universe={universe}
          minValue={minValue}
          scanEnabled={scanEnabled}
          learnEnabled={learnEnabled}
          kill={kill}
          paper={paper}
          owner={u.owner}
          username={u.username || "khách"}
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
        <h2 className="font-semibold">Danh sách theo dõi {u.username && <span className="font-normal text-muted">của {u.username}</span>}</h2>
        <p className="mt-1 mb-3 text-xs text-muted">
          Mã trong danh sách luôn được quét tín hiệu mỗi ngày, kể cả khi không đạt ngưỡng thanh khoản / không thuộc phạm vi quét.
        </p>
        <WatchlistEditor tickers={watchlist} />
      </section>

      <section id="thong-bao" className="mb-8 scroll-mt-20">
        <h2 className="font-semibold">Thông báo</h2>
        <p className="mt-1 mb-3 text-xs text-muted">
          Cùng nội dung với cảnh báo Telegram từ các cron (watcher, quét tín hiệu, báo cáo vị thế). Chọn loại muốn hiện nổi — chuông 🔔 trên menu giữ lịch sử
          (tín hiệu, cắt lỗ/chốt lời, hệ thống: 7 ngày; cơ hội trong phiên: 3 ngày; báo cáo vị thế: 2 ngày — quá hạn tự xóa cho nhẹ dữ liệu). Lưu riêng trên
          trình duyệt này.
        </p>
        <AlertPrefs />
        <h3 className="mt-5 font-semibold">Thông báo đẩy &amp; Telegram riêng</h3>
        <p className="mt-1 mb-3 text-xs text-muted">
          Nhận cảnh báo cả khi không mở web: thông báo đẩy về điện thoại/máy tính và/hoặc Telegram riêng của bạn. Lưu theo tên người dùng.
        </p>
        <PushSettings username={u.username} />
        <h3 className="mt-5 mb-3 font-semibold">Cài app</h3>
        <InstallCard />
      </section>
    </main>
  );
}
