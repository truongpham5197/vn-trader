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
  const stopPct = ((s.entry - s.stop) / s.entry) * 100;
  const targetPct = ((s.target - s.entry) / s.entry) * 100;
  const riskVnd = (s.entry - s.stop) * s.qty * 1000;
  const text = [
    `🟢 <b>TÍN HIỆU MUA — ${s.ticker}</b>`,
    `<i>${s.reason}</i>`,
    ``,
    `💰 Giá vào (LO): <b>${fmt(s.entry)}</b>`,
    `🛑 Cắt lỗ: ${fmt(s.stop)} (−${stopPct.toFixed(1)}%)`,
    `🎯 Chốt lãi: ${fmt(s.target)} (<b>+${targetPct.toFixed(1)}%</b> tiềm năng)`,
    ``,
    `📐 R:R <b>${s.rr.toFixed(1)}</b> — lãi kỳ vọng gấp ${s.rr.toFixed(1)}× rủi ro`,
    `📦 Khối lượng: <b>${s.qty}cp</b> ≈ ${fmtVnd(s.valueVnd)}`,
    `⚠️ Nếu chạm stop: lỗ ~${fmtVnd(riskVnd)} (~1% NAV)`,
  ].join("\n");
  return sendTelegram(text, [
    [
      { text: "📈 Đặt lệnh", callback_data: `order:${s.signalId}` },
      { text: "✅ Đã vào tay", callback_data: `taken:${s.signalId}` },
      { text: "⏭ Bỏ qua", callback_data: `skip:${s.signalId}` },
    ],
  ]);
}
