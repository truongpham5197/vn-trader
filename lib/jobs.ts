import cron from "node-cron";
import { syncDailyBars } from "./data/sync";
import { runScan } from "./scan";

const TZ = "Asia/Ho_Chi_Minh";
let started = false;

export function startJobs(): void {
  if (started) return;
  started = true;

  // 15:20 T2-T6: kéo EOD bars (data thường settle sau 15:00)
  cron.schedule(
    "20 15 * * 1-5",
    async () => {
      console.log("[cron] eod-sync start");
      const r = await syncDailyBars({ lookbackDays: 10 });
      console.log(`[cron] eod-sync done: ${r.synced} ok, ${r.failed.length} failed`);
    },
    { timezone: TZ },
  );

  // 15:40 T2-T6: scan → tín hiệu → Telegram
  cron.schedule(
    "40 15 * * 1-5",
    async () => {
      console.log("[cron] scan start");
      const r = await runScan({ notify: true });
      console.log("[cron] scan done", r);
    },
    { timezone: TZ },
  );

  // Mỗi phút trong phiên (bỏ nghỉ trưa 12h) T2-T6: stop-loss watcher + sync lệnh pending
  cron.schedule(
    "* 9-11,13-14 * * 1-5",
    async () => {
      const { runWatcher } = await import("./tcbs/watcher");
      await runWatcher().catch((e) => console.error("[watcher]", e));
    },
    { timezone: TZ },
  );

  // Mỗi 30 phút 9:00–14:30 T2–T6: báo cáo vị thế theo % lãi/lỗ live
  cron.schedule(
    "*/30 9-14 * * 1-5",
    async () => {
      const { positionsReport, formatPositionsReport } = await import("./report/positions");
      const lines = await positionsReport();
      if (lines.length) {
        const { sendTelegram } = await import("./telegram/notify");
        await sendTelegram(formatPositionsReport(lines));
      }
    },
    { timezone: TZ },
  );

  // 20:00 Chủ nhật: báo cáo tuần
  cron.schedule(
    "0 20 * * 0",
    async () => {
      const { weeklyReport } = await import("./journal/report");
      await weeklyReport().catch((e) => console.error("[weekly-report]", e));
    },
    { timezone: TZ },
  );

  console.log(
    "[cron] eod-sync 15:20 + scan 15:40 + watcher */1 9-11,13-14 + positions */30 9-14 + weekly-report 20:00 CN (Asia/Ho_Chi_Minh)",
  );
}
