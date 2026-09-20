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

  console.log("[cron] scheduled eod-sync 15:20 + scan 15:40 (Asia/Ho_Chi_Minh, Mon-Fri)");
}
