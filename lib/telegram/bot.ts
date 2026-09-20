import { Bot } from "grammy";
import { prisma } from "../prisma";
import { getNum, getBool, setSetting } from "../settings";
import { vnToday } from "../vn-time";

let started = false;

export function startTelegramBot(): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || started) return;
  started = true;

  const bot = new Bot(token);
  const allowed = (ctx: { chat?: { id: number } }) =>
    !chatId || String(ctx.chat?.id) === chatId;

  bot.command("status", async (ctx) => {
    if (!allowed(ctx)) return;
    const [symbols, bars, todaySignals, openTrades] = await Promise.all([
      prisma.symbol.count({ where: { active: true } }),
      prisma.dailyBar.count(),
      prisma.signal.count({ where: { date: vnToday() } }),
      prisma.trade.count({ where: { status: "open" } }),
    ]);
    const flags = [
      `scan=${(await getBool("scanEnabled")) ? "ON" : "OFF"}`,
      `paper=${(await getBool("paperTrading")) ? "ON" : "OFF"}`,
      `kill=${(await getBool("killSwitch")) ? "ON" : "OFF"}`,
      `nav=${((await getNum("navVnd")) / 1e6).toFixed(0)}tr`,
      `risk=${((await getNum("riskPct")) * 100).toFixed(1)}%`,
    ];
    await ctx.reply(
      `📊 Status\nsymbols: ${symbols} | bars: ${bars}\nsignals hôm nay: ${todaySignals} | trades mở: ${openTrades}\n${flags.join(" | ")}`,
    );
  });

  bot.command("signals", async (ctx) => {
    if (!allowed(ctx)) return;
    const sigs = await prisma.signal.findMany({
      where: { date: vnToday() },
      include: { symbol: true, strategy: true },
      orderBy: { id: "desc" },
      take: 20,
    });
    if (!sigs.length) return void (await ctx.reply("Không có tín hiệu hôm nay."));
    await ctx.reply(
      sigs
        .map(
          (s) =>
            `${s.symbol.ticker} [${s.strategy.name}] entry ${s.entry} stop ${s.stop} qty ${s.qty} — ${s.status}`,
        )
        .join("\n"),
    );
  });

  bot.command("positions", async (ctx) => {
    if (!allowed(ctx)) return;
    const trades = await prisma.trade.findMany({
      where: { status: "open" },
      include: { symbol: true },
    });
    if (!trades.length) return void (await ctx.reply("Không có vị thế mở."));
    await ctx.reply(
      trades
        .map((t) => `${t.symbol.ticker} ${t.qty}cp @ ${t.entryPrice} — mở ${t.openedAt.toISOString().slice(0, 10)}`)
        .join("\n"),
    );
  });

  bot.command("pause", async (ctx) => {
    if (!allowed(ctx)) return;
    await setSetting("scanEnabled", "false");
    await ctx.reply("⏸ Scanner OFF");
  });

  bot.command("resume", async (ctx) => {
    if (!allowed(ctx)) return;
    await setSetting("scanEnabled", "true");
    await ctx.reply("▶️ Scanner ON");
  });

  bot.command("kill", async (ctx) => {
    if (!allowed(ctx)) return;
    await setSetting("killSwitch", "true");
    await setSetting("scanEnabled", "false");
    await ctx.reply("🛑 KILL SWITCH ON — scanner dừng, mọi order bị chặn. /resume để bật lại scan.");
  });

  bot.on("callback_query:data", async (ctx) => {
    if (!allowed(ctx)) return;
    const data = ctx.callbackQuery.data;
    const [action, idStr] = data.split(":");
    const id = Number(idStr);
    if (action === "skip" || action === "taken") {
      await prisma.signal.update({
        where: { id },
        data: { status: action === "skip" ? "skipped" : "taken" },
      });
      await ctx.answerCallbackQuery({ text: action === "skip" ? "Đã bỏ qua" : "Đã ghi nhận vào lệnh" });
    } else {
      await ctx.answerCallbackQuery();
    }
  });

  bot.catch((e) => console.error("[telegram-bot]", e));
  void bot.start();
  console.log("[telegram-bot] polling started");
}
