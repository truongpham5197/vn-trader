export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startJobs } = await import("./lib/jobs");
    const { startTelegramBot } = await import("./lib/telegram/bot");
    startJobs();
    startTelegramBot();
  }
}
