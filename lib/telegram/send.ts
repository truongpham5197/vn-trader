// Gửi tin Telegram thô — không import alerts (tránh vòng import alerts ↔ notify).
export type TgButtons = { text: string; callback_data: string }[][];

export const tgToken = () => process.env.TELEGRAM_BOT_TOKEN ?? "";

/** sendMessage parse_mode=HTML. status 403 = người dùng đã chặn bot / rời chat. */
export async function tgSend(chatId: string, text: string, buttons?: TgButtons): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(`https://api.telegram.org/bot${tgToken()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) console.error("[telegram] sendMessage failed", chatId, res.status, await res.text());
  return { ok: res.ok, status: res.status };
}

let botName: string | undefined;
/** @username của bot — env TELEGRAM_BOT_USERNAME hoặc getMe (cache). null khi không gọi được Telegram. */
export async function botUsername(): Promise<string | null> {
  if (botName) return botName;
  if (process.env.TELEGRAM_BOT_USERNAME) return (botName = process.env.TELEGRAM_BOT_USERNAME.replace(/^@/, ""));
  if (!tgToken()) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${tgToken()}/getMe`, { signal: AbortSignal.timeout(5000) });
    const j = (await r.json()) as { ok: boolean; result?: { username?: string } };
    return j.result?.username ? (botName = j.result.username) : null;
  } catch {
    return null;
  }
}
