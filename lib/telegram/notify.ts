const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT_ID = () => process.env.TELEGRAM_CHAT_ID ?? "";

export function telegramConfigured(): boolean {
  return Boolean(TOKEN() && CHAT_ID());
}

export async function sendTelegram(
  text: string,
  buttons?: { text: string; callback_data: string }[][],
): Promise<boolean> {
  if (!telegramConfigured()) {
    console.log("[telegram:dry]", text);
    return true;
  }
  const res = await fetch(`https://api.telegram.org/bot${TOKEN()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID(),
      text,
      parse_mode: "HTML",
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    }),
  });
  if (!res.ok) {
    console.error("[telegram] sendMessage failed", res.status, await res.text());
    return false;
  }
  return true;
}

const fmt = (n: number) => n.toFixed(2);
const fmtVnd = (n: number) => `${(n / 1e6).toFixed(1)}tr`;

export async function notifySignal(s: {
  signalId: number;
  ticker: string;
  strategy: string;
  entry: number;
  stop: number;
  target: number;
  qty: number;
  valueVnd: number;
  rr: number;
  reason: string;
}): Promise<boolean> {
  const stopPct = (((s.entry - s.stop) / s.entry) * 100).toFixed(1);
  const text = [
    `<b>${s.ticker}</b> — ${s.strategy}`,
    `Entry <b>${fmt(s.entry)}</b> (LO) | Stop ${fmt(s.stop)} (-${stopPct}%) | Target ${fmt(s.target)}`,
    `Size <b>${s.qty}cp</b> ≈ ${fmtVnd(s.valueVnd)} | R:R ${s.rr}`,
    `<i>${s.reason}</i>`,
  ].join("\n");
  return sendTelegram(text, [
    [
      { text: "📈 Đặt lệnh", callback_data: `order:${s.signalId}` },
      { text: "✅ Đã vào tay", callback_data: `taken:${s.signalId}` },
      { text: "⏭ Bỏ qua", callback_data: `skip:${s.signalId}` },
    ],
  ]);
}
