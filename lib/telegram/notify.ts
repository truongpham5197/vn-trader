import { pushAlert, type WebAlert } from "../alerts";
import { tgSend, tgToken as TOKEN, type TgButtons } from "./send";

const CHAT_ID = () => process.env.TELEGRAM_CHAT_ID ?? "";

export function telegramConfigured(): boolean {
  return Boolean(TOKEN() && CHAT_ID());
}

export async function sendTelegram(
  text: string,
  buttons?: TgButtons,
  web?: WebAlert,
): Promise<boolean> {
  if (web) await pushAlert(text, web);
  if (!telegramConfigured()) {
    console.log("[telegram:dry]", text);
    return true;
  }
  return (await tgSend(CHAT_ID(), text, buttons)).ok;
}

const fmt = (n: number) => n.toFixed(2);
const fmtVnd = (n: number) => `${(n / 1e6).toFixed(1)}tr`;
/** Escape text động cho parse_mode=HTML — chuỗi có < MA10 / RSI>70 sẽ phá markup. */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function notifySignal(s: {
  signalId: number;
  ticker: string;
  sector?: string;
  strategy: string;
  entry: number;
  stop: number;
  target: number;
  qty: number;
  valueVnd: number;
  rr: number;
  reason: string;
  plan?: string;
  buyZone?: [number, number];
  dayBar?: { open: number; high: number; low: number; close: number };
  ref?: number; // giá tham chiếu = close phiên trước
  fundamentals?: string; // HTML đã escape — formatFundamentalsTg
}): Promise<boolean> {
  const stopPct = ((s.entry - s.stop) / s.entry) * 100;
  const targetPct = ((s.target - s.entry) / s.entry) * 100;
  const riskVnd = (s.entry - s.stop) * s.qty * 1000;
  const ohlc = s.dayBar
    ? `📈 O ${fmt(s.dayBar.open)} · H ${fmt(s.dayBar.high)} · L ${fmt(s.dayBar.low)} · TC ${
        s.ref ? fmt(s.ref) : "?"
      }${
        s.ref ? ` (${s.dayBar.close >= s.ref ? "+" : ""}${(((s.dayBar.close - s.ref) / s.ref) * 100).toFixed(2)}% vs TC)` : ""
      }`
    : null;
  const text = [
    `🟢 <b>TÍN HIỆU MUA — ${s.ticker}</b>${s.sector ? ` · ${s.sector}` : ""}`,
    `📌 <b>Vì sao mua:</b> ${esc(s.reason)}`,
    ...(ohlc ? [ohlc] : []),
    ``,
    `💰 Giá vào (LO): <b>${fmt(s.entry)}</b>`,
    ...(s.buyZone
      ? [`🛡 Vùng mua an toàn: <b>${fmt(s.buyZone[0])} – ${fmt(s.buyZone[1])}</b> — đặt trong vùng này, không đuổi giá cao hơn`]
      : []),
    `🛑 Cắt lỗ: ${fmt(s.stop)} (−${stopPct.toFixed(1)}%)`,
    `🎯 Chốt lãi: ${fmt(s.target)} (<b>+${targetPct.toFixed(1)}%</b> tiềm năng)`,
    ``,
    `📐 R:R <b>${s.rr.toFixed(1)}</b> — lãi kỳ vọng gấp ${s.rr.toFixed(1)}× rủi ro`,
    `📦 Khối lượng: <b>${s.qty}cp</b> ≈ ${fmtVnd(s.valueVnd)}`,
    `⚠️ Nếu chạm stop: lỗ ~${fmtVnd(riskVnd)} (~1% NAV)`,
    ...(s.plan ? [``, `🗓 <i>${esc(s.plan)}</i>`] : []),
    ...(s.fundamentals ? [``, s.fundamentals] : []),
    ``,
    `<i>Tín hiệu dựa trên giá + khối lượng; thông tin kinh doanh để tham khảo, không phải khuyến nghị.</i>`,
  ].join("\n");
  return sendTelegram(text, [
    [
      { text: "📈 Đặt lệnh", callback_data: `order:${s.signalId}` },
      { text: "✅ Đã vào tay", callback_data: `taken:${s.signalId}` },
      { text: "⏭ Bỏ qua", callback_data: `skip:${s.signalId}` },
    ],
  ], { kind: "signal", ticker: s.ticker, userId: null });
}
