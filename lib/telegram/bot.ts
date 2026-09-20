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

  bot.command("otp", async (ctx) => {
    if (!allowed(ctx)) return;
    const otp = ctx.match?.trim();
    if (!otp) return void (await ctx.reply("Dùng: /otp <mã iOTP từ app TCInvest>"));
    try {
      const { authenticate } = await import("../tcbs/client");
      const ok = await authenticate(otp);
      await ctx.reply(ok ? "🔓 TCBS auth OK — token đã cache" : "❌ OTP sai hoặc từ chối");
    } catch (e) {
      await ctx.reply(`❌ ${e instanceof Error ? e.message : "lỗi auth"}`);
    }
  });

  bot.command("auth", async (ctx) => {
    if (!allowed(ctx)) return;
    const { tcbsConfigured } = await import("../tcbs/client");
    const row = await prisma.setting.findUnique({ where: { key: "tcbsToken" } });
    await ctx.reply(
      `TCBS configured: ${tcbsConfigured() ? "✅" : "❌ (thiếu TCBS_API_KEY/TCBS_ACCOUNT_NO)"}\ntoken: ${row?.value ? "có" : "chưa có — /otp <mã>"}`,
    );
  });

  bot.on("callback_query:data", async (ctx) => {
    if (!allowed(ctx)) return;
    const data = ctx.callbackQuery.data;
    const [action, idStr] = data.split(":");
    const id = Number(idStr);
    if (action === "skip" || action === "taken") {
      const signal = await prisma.signal.update({
        where: { id },
        data: { status: action === "skip" ? "skipped" : "taken" },
      });
      if (action === "taken") {
        // Lệnh đặt tay ngoài broker → vẫn mở Trade để watcher cắt lỗ + journal
        await prisma.trade.create({
          data: {
            symbolId: signal.symbolId,
            qty: signal.qty,
            entryPrice: signal.entry,
            stopPrice: signal.stop,
            targetPrice: signal.target,
            signalId: signal.id,
            note: "manual",
          },
        });
      }
      await ctx.answerCallbackQuery({ text: action === "skip" ? "Đã bỏ qua" : "Đã mở trade + bật watcher" });
    } else if (action === "order") {
      await ctx.answerCallbackQuery({ text: "Đang đặt lệnh…" });
      const { placeSignalOrder } = await import("../orders");
      const r = await placeSignalOrder(id);
      await ctx.reply(`${r.ok ? "✅" : "❌"} ${r.message}`);
    } else {
      await ctx.answerCallbackQuery();
    }
  });

  bot.catch((e) => console.error("[telegram-bot]", e));
  void bot.start();
  console.log("[telegram-bot] polling started");
}
