export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Vercel serverless: không có process nền — cron qua vercel.json,
    // Telegram qua webhook /api/telegram/webhook
    if (process.env.VERCEL) return;
    const { startJobs } = await import("./lib/jobs");
    startJobs();
    // Polling tắt khi share bot token với app khác — 2 poller trên cùng
    // token sẽ chia nhau updates (Hermes gateway đang poll token này).
    if (process.env.TELEGRAM_POLLING !== "false") {
      const { startTelegramBot } = await import("./lib/telegram/bot");
      startTelegramBot();
    }
  }
}
