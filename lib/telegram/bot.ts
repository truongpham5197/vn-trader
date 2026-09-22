import { Bot } from "grammy";
import { prisma } from "../prisma";
import { getNum, getBool, setSetting, getSetting } from "../settings";
import { vnToday } from "../vn-time";
import { esc } from "./notify";

let started = false;

/** Bot đã đăng ký đủ handlers — dùng cho cả polling (local) lẫn webhook (Vercel). */
export function createBot(): Bot {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const bot = new Bot(token);
  // Mọi sendMessage mặc định parse HTML — ctx.reply() KHÔNG tự set parse_mode,
  // thiếu dòng này thì <b>/<i> hiện thô trong group.
  bot.api.config.use((prev, method, payload, signal) =>
    prev(
      method,
      method === "sendMessage" ? { parse_mode: "HTML", ...payload } : payload,
      signal,
    ),
  );
  const allowed = (ctx: { chat?: { id: number } }) =>
    !chatId || String(ctx.chat?.id) === chatId;

  // Log chat.id của mọi update — tiện discover group chat_id khi bot mới vào group
  bot.use(async (ctx, next) => {
    console.log(
      "[tg] update from chat",
      ctx.chat?.id,
      Object.keys(ctx.update).filter((k) => k !== "update_id"),
    );
    await next();
  });

  bot.command("status", async (ctx) => {
    if (!allowed(ctx)) return;
    const [symbols, bars, todaySignals, openTrades] = await Promise.all([
      prisma.symbol.count({ where: { active: true } }),
      prisma.dailyBar.count(),
      prisma.signal.count({ where: { date: vnToday() } }),
      prisma.trade.count({ where: { status: "open" } }),
    ]);
    const [scan, paper, kill, nav, risk] = await Promise.all([
      getBool("scanEnabled"),
      getBool("paperTrading"),
      getBool("killSwitch"),
      getNum("navVnd"),
      getNum("riskPct"),
    ]);
    await ctx.reply(
      `📊 <b>TRẠNG THÁI HỆ THỐNG</b>\n\n` +
        `📈 Dữ liệu: <b>${symbols.toLocaleString("en-US")}</b> mã · ${bars.toLocaleString("en-US")} bars\n` +
        `🔔 Tín hiệu hôm nay: <b>${todaySignals}</b> · Vị thế mở: <b>${openTrades}</b>\n` +
        `⚙️ scanner <b>${scan ? "ON" : "OFF"}</b> · paper <b>${paper ? "ON" : "OFF"}</b> · kill <b>${kill ? "ON 🛑" : "off"}</b>\n` +
        `💰 NAV <b>${(nav / 1e6).toFixed(0)}tr</b> · risk/lệnh ${(risk * 100).toFixed(1)}% · universe <b>${(await getSetting("universe")).toUpperCase()}</b>`,
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
      [`🔔 <b>TÍN HIỆU HÔM NAY</b>`, ...sigs.map((s) => {
        const up = (((s.target - s.entry) / s.entry) * 100).toFixed(1);
        const dn = (((s.entry - s.stop) / s.entry) * 100).toFixed(1);
        return (
          `<b>${s.symbol.ticker}</b> · ${s.strategy.name}\n` +
          `  vào ${s.entry.toFixed(2)} · TP ${s.target.toFixed(2)} (+${up}%) · SL ${s.stop.toFixed(2)} (−${dn}%)` +
          ` · ${s.qty.toLocaleString("en-US")}cp — <i>${s.status}</i>`
        );
      })].join("\n\n"),
    );
  });

  bot.command("positions", async (ctx) => {
    if (!allowed(ctx)) return;
    const { positionsReport, formatPositionsReport } = await import("../report/positions");
    await ctx.reply(formatPositionsReport(await positionsReport()));
  });

  // /orders — tín hiệu chờ xử lý hôm nay + vị thế đang giữ (live %)
  bot.command("orders", async (ctx) => {
    if (!allowed(ctx)) return;
    const pending = await prisma.signal.findMany({
      where: { date: vnToday(), status: { in: ["new", "notified"] } },
      include: { symbol: true, strategy: true },
      orderBy: { id: "desc" },
      take: 15,
    });
    const { positionsReport, formatPositionsReport } = await import("../report/positions");

    const parts: string[] = [];
    if (pending.length) {
      parts.push("📋 <b>Tín hiệu chờ xử lý</b>");
      // Gom theo ngành
      const bySector = new Map<string, typeof pending>();
      for (const s of pending) {
        const k = s.symbol.sector ?? "Khác";
        bySector.set(k, [...(bySector.get(k) ?? []), s]);
      }
      for (const [sector, sigs] of [...bySector.entries()].sort((a, b) => b[1].length - a[1].length)) {
        parts.push(`\n<b>▸ ${esc(sector)}</b>`);
        for (const s of sigs) {
          const up = (((s.target - s.entry) / s.entry) * 100).toFixed(1);
          const dn = (((s.entry - s.stop) / s.entry) * 100).toFixed(1);
          parts.push(
            `• <b>${s.symbol.ticker}</b> <i>${esc(s.strategy.name)}</i>\n` +
              `  vào ${s.entry.toFixed(2)} · TP ${s.target.toFixed(2)} (+${up}%) · SL ${s.stop.toFixed(2)} (−${dn}%) · ${s.qty.toLocaleString("en-US")}cp`,
          );
        }
      }
      parts.push("");
    }
    parts.push(formatPositionsReport(await positionsReport()));
    await ctx.reply(parts.join("\n"));
  });

  // /vn30 — watchlist setup tốt nhất trong rổ VN30
  bot.command("vn30", async (ctx) => {
    if (!allowed(ctx)) return;
    const { vn30Snapshot } = await import("../analysis/vn30");
    const rows = (await vn30Snapshot()).slice(0, 10);
    if (!rows.length) return void (await ctx.reply("Chưa đủ data VN30."));
    const parts = rows.map((r) => {
      const zone = r.buyZone
        ? `mua ${r.buyZone[0].toFixed(2)}–${r.buyZone[1].toFixed(2)} · SL ${r.stop?.toFixed(2)} · TP ${r.target?.toFixed(2)}\n   `
        : "";
      return `${r.setup} <b>${r.ticker}</b> @ ${r.close.toFixed(2)} (${r.chgPct !== null && r.chgPct >= 0 ? "+" : ""}${r.chgPct?.toFixed(1)}%)\n   ${zone}<i>${esc(r.note)}</i>`;
    });
    await ctx.reply(`🔭 <b>VN30 WATCHLIST</b>\n\n` + parts.join("\n\n"));
  });

  // /nganh — xếp hạng nhóm ngành + mã đáng chú ý thuộc ngành mạnh
  bot.command("nganh", async (ctx) => {
    if (!allowed(ctx)) return;
    const { loadSectorStrength, formatSectorStrength } = await import("../analysis/sector-strength");
    await ctx.reply(formatSectorStrength(await loadSectorStrength()));
  });

  // /picks — preview digest top 5 mã tiềm năng (giá live vs vùng mua)
  bot.command("picks", async (ctx) => {
    if (!allowed(ctx)) return;
    const { collectTopPicks, formatTopPicks } = await import("../report/top-picks");
    const { picks, signalDate } = await collectTopPicks(5);
    if (!picks.length) {
      return void (await ctx.reply("Chưa có mã nào — chưa chạy scan hoặc không có setup."));
    }
    await ctx.reply(formatTopPicks(picks, signalDate));
  });

  // /help — giải thích các chỉ báo trong alert
  bot.command("help", async (ctx) => {
    if (!allowed(ctx)) return;
    await ctx.reply(
      [
        "📖 <b>Giải thích thuật ngữ trong tín hiệu</b>",
        "",
        "<b>Giá vào (LO)</b> — giá đặt lệnh Limit Order phiên mai. Giá tham khảo từ nghìn đồng.",
        "<b>Cắt lỗ (SL)</b> — giá bán khi sai; app tự canh và cảnh báo/bán khi chạm.",
        "<b>Chốt lãi (TP)</b> — giá mục tiêu bán chốt lãi.",
        "<b>R:R (Risk:Reward)</b> — tỷ lệ lãi kỳ vọng / lỗ rủi ro. R:R 2.0 = mạo hiểm 1đ để ăn 2đ. Nên ≥ 1.5.",
        "<b>vol ×</b> — khối lượng giao dịch so với trung bình 20 phiên. 2× = đông gấp đôi bình thường → breakout có lực.",
        "<b>ATR</b> — biên độ dao động trung bình 14 phiên; dùng để đặt stop theo volatility.",
        "<b>1R</b> — đơn vị rủi ro = (giá vào − stop) × số cp. Mỗi lệnh rủi ~1% NAV.",
        "<b>⏳T+x</b> — cổ phiếu chưa về tài khoản (T+2): mới mua hôm nay thì T+2 mới bán được.",
        "<b>Breakout-20</b> — mua khi giá đóng cửa vượt đỉnh cao nhất 20 phiên kèm vol bùng.",
        "<b>Pullback-MA20</b> — mua khi giá trong uptrend hồi về đúng trung bình 20 phiên.",
        "<b>RSI(2)</b> — chỉ báo quá bán ngắn hạn: RSI 2 phiên &lt; 5 trong uptrend → hồi kỹ thuật.",
        "",
        "Lệnh: /nganh /status /signals /orders /positions /vn30 /picks /plan &lt;MÃ&gt; /add /close /pause /resume /kill /otp /auth",
      ].join("\n"),
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
    await setSetting("killSwitch", "false");
    await ctx.reply("▶️ Scanner ON — kill switch OFF");
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
    if (!otp) return void (await ctx.reply("Dùng: /otp &lt;mã iOTP từ app TCInvest&gt;"));
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
      `TCBS configured: ${tcbsConfigured() ? "✅" : "❌ (thiếu TCBS_API_KEY/TCBS_ACCOUNT_NO)"}\ntoken: ${row?.value ? "có" : "chưa có — /otp &lt;mã&gt;"}`,
    );
  });

  // /add GAS 1000 95.5 [stop] — log vị thế mua tay → watcher canh stop + journal
  bot.command("add", async (ctx) => {
    if (!allowed(ctx)) return;
    const [ticker, qtyStr, entryStr, stopStr] = (ctx.match ?? "").trim().split(/\s+/);
    const qty = Number(qtyStr);
    const entry = Number(entryStr);
    if (!ticker || !qty || !entry) {
      return void (await ctx.reply("Dùng: /add &lt;MÃ&gt; &lt;qty&gt; &lt;giá vốn&gt; [stop] — vd: /add GAS 1000 95.5 90"));
    }
    const sym = await prisma.symbol.findUnique({ where: { ticker: ticker.toUpperCase() } });
    if (!sym) return void (await ctx.reply(`❌ không tìm thấy mã ${ticker.toUpperCase()}`));
    const trade = await prisma.trade.create({
      data: {
        symbolId: sym.id,
        qty,
        entryPrice: entry,
        stopPrice: stopStr ? Number(stopStr) : null,
        note: "manual-add",
      },
    });
    if (stopStr) {
      return void (await ctx.reply(
        `✅ Đã mở trade #${trade.id}: <b>${sym.ticker}</b> ${qty}cp @ ${entry} | stop ${stopStr} — watcher đang canh`,
      ));
    }
    // Không có stop → gợi ý tự động theo target +5%
    const { suggestForTrade } = await import("../risk/suggest");
    const sg = await suggestForTrade(trade.id, 5);
    if (!sg) {
      return void (await ctx.reply(
        `✅ Đã mở trade #${trade.id}: <b>${sym.ticker}</b> ${qty}cp @ ${entry} (chưa có stop — thiếu data để gợi ý)`,
      ));
    }
    await ctx.reply(
      `✅ Đã mở trade #${trade.id}: <b>${sym.ticker}</b> ${qty}cp @ ${entry}\n\n` +
        `💡 Gợi ý chốt +5%: TP <b>${sg.target}</b> | SL <b>${sg.stop}</b> (R:R ${sg.rr.toFixed(1)})\n` +
        `<i>${esc(sg.note)}</i>`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: `✅ Áp dụng SL ${sg.stop} / TP ${sg.target}`, callback_data: `setplan:${trade.id}:${sg.stop}:${sg.target}` }],
          ],
        },
      },
    );
  });

  // /plan GAS [pct] — gợi ý lại stop/target cho trade đang mở (default +5%)
  bot.command("plan", async (ctx) => {
    if (!allowed(ctx)) return;
    const [ticker, pctStr] = (ctx.match ?? "").trim().split(/\s+/);
    if (!ticker) return void (await ctx.reply("Dùng: /plan &lt;MÃ&gt; [%lãi mục tiêu] — vd: /plan GAS 5"));
    const sym = await prisma.symbol.findUnique({ where: { ticker: ticker.toUpperCase() } });
    if (!sym) return void (await ctx.reply(`❌ không tìm thấy mã ${ticker.toUpperCase()}`));
    const trade = await prisma.trade.findFirst({
      where: { symbolId: sym.id, status: "open" },
      orderBy: { id: "desc" },
    });
    if (!trade) return void (await ctx.reply(`❌ ${sym.ticker} không có trade đang mở`));
    const { suggestForTrade } = await import("../risk/suggest");
    const sg = await suggestForTrade(trade.id, Number(pctStr) || 5);
    if (!sg) return void (await ctx.reply("❌ thiếu data để gợi ý"));
    const pct = Number(pctStr) || 5;
    const tpPct = (((sg.target - trade.entryPrice) / trade.entryPrice) * 100).toFixed(1);
    const slPct = (((trade.entryPrice - sg.stop) / trade.entryPrice) * 100).toFixed(1);
    await ctx.reply(
      `💡 <b>GỢI Ý — ${sym.ticker}</b> (vốn ${trade.entryPrice})\n\n` +
        `🎯 TP <b>${sg.target.toFixed(2)}</b> (+${tpPct}%)\n` +
        `🛑 SL <b>${sg.stop.toFixed(2)}</b> (−${slPct}%)\n` +
        `📐 R:R <b>${sg.rr.toFixed(1)}</b> — lãi kỳ vọng gấp ${sg.rr.toFixed(1)}× rủi ro\n\n` +
        `<i>${esc(sg.note)}</i>`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: `✅ Áp dụng SL ${sg.stop} / TP ${sg.target}`, callback_data: `setplan:${trade.id}:${sg.stop}:${sg.target}` }],
          ],
        },
      },
    );
  });

  // /close GAS [giá] — đóng trade mở, tính P&L net
  bot.command("close", async (ctx) => {
    if (!allowed(ctx)) return;
    const [ticker, exitStr] = (ctx.match ?? "").trim().split(/\s+/);
    if (!ticker) return void (await ctx.reply("Dùng: /close &lt;MÃ&gt; [giá bán]"));
    const sym = await prisma.symbol.findUnique({ where: { ticker: ticker.toUpperCase() } });
    if (!sym) return void (await ctx.reply(`❌ không tìm thấy mã ${ticker.toUpperCase()}`));
    const trade = await prisma.trade.findFirst({
      where: { symbolId: sym.id, status: "open" },
      orderBy: { id: "desc" },
    });
    if (!trade) return void (await ctx.reply(`❌ ${sym.ticker} không có trade đang mở`));
    let exit = Number(exitStr);
    if (!exit) {
      const last = await prisma.dailyBar.findFirst({
        where: { symbolId: sym.id },
        orderBy: { date: "desc" },
      });
      if (!last) return void (await ctx.reply("❌ không có giá tham chiếu — truyền giá: /close GAS 92"));
      exit = last.close;
    }
    const proceeds = exit * trade.qty * 1000 * (1 - 0.0025);
    const cost = trade.entryPrice * trade.qty * 1000 * 1.0015;
    const pnl = proceeds - cost;
    await prisma.trade.update({
      where: { id: trade.id },
      data: { status: "closed", exitPrice: exit, pnl, exitReason: "manual", closedAt: new Date() },
    });
    const pnlPct = (pnl / (trade.entryPrice * trade.qty * 1000)) * 100;
    const icon = pnl >= 0 ? "🟢" : "🔴";
    await ctx.reply(
      `🔒 <b>ĐÓNG ${sym.ticker}</b>\n\n` +
        `Bán ${trade.qty.toLocaleString("en-US")}cp @ ${exit} (vốn ${trade.entryPrice})\n` +
        `${icon} P&L net <b>${pnl >= 0 ? "+" : ""}${(pnl / 1e6).toFixed(2)}tr</b>` +
        ` (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%) — đã trừ phí+thuế`,
    );
  });

  bot.on("callback_query:data", async (ctx) => {
    if (!allowed(ctx)) return;
    const data = ctx.callbackQuery.data;
    const [action, idStr] = data.split(":");
    const id = Number(idStr);
    if (action === "skip" || action === "taken") {
      const cur = await prisma.signal.findUnique({ where: { id }, select: { status: true } });
      if (cur?.status === "taken" || cur?.status === "skipped") {
        await ctx.answerCallbackQuery({ text: "Signal này đã xử lý" });
        return;
      }
      const signal = await prisma.signal.update({
        where: { id },
        data: { status: action === "skip" ? "skipped" : "taken" },
      });
      if (action === "taken") {
        // Lệnh đặt tay ngoài broker → mở Trade để watcher cắt lỗ + journal.
        // Guard: signal có thể đã có trade (bấm 2 lần / Telegram retry)
        const dup = await prisma.trade.findFirst({
          where: { signalId: signal.id, status: "open" },
        });
        if (!dup) {
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
      }
      await ctx.answerCallbackQuery({ text: action === "skip" ? "Đã bỏ qua" : "Đã mở trade + bật watcher" });
    } else if (action === "setplan") {
      const [stopStr, targetStr] = data.split(":").slice(2);
      await prisma.trade.update({
        where: { id },
        data: { stopPrice: Number(stopStr), targetPrice: Number(targetStr) },
      });
      await ctx.answerCallbackQuery({ text: "Đã áp dụng plan" });
      await ctx.reply(`🛡 Trade #${id}: stop ${stopStr} | target ${targetStr} — watcher đang canh`);
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
  return bot;
}

export function startTelegramBot(): void {
  if (!process.env.TELEGRAM_BOT_TOKEN || started) return;
  started = true;
  void createBot().start();
  console.log("[telegram-bot] polling started");
}
