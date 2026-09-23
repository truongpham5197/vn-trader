import { unstable_cache } from "next/cache";
import { loadSectorStrength, type SectorStrength } from "./sector-strength";
import { getBool, getSetting, setSetting } from "../settings";
import { esc, sendTelegram } from "../telegram/notify";
import { inVnSession, vnNow, vnToday } from "../vn-time";

/** Ghép giá trong phiên từ 9:00 tới 16:00 (T2–T6) — sau 15:00 chờ eod-sync ghi bars hôm nay vào DB. */
export function inLiveWindow(n = vnNow()): boolean {
  const m = n.getHours() * 60 + n.getMinutes();
  return n.getDay() >= 1 && n.getDay() <= 5 && m >= 9 * 60 && m < 16 * 60;
}

// Nến ngày ổn định → cache 15ph; trong phiên ghép giá DNSE (~160 request) → cache 5ph
const eod = unstable_cache(() => loadSectorStrength(), ["sector-strength"], { revalidate: 900 });
const live = unstable_cache(() => loadSectorStrength({ live: true }), ["sector-strength-live"], { revalidate: 300 });

export const currentSectorStrength = (): Promise<SectorStrength> => (inLiveWindow() ? live() : eod());

const ALERT_EVERY_MS = 5 * 60e3;
const dong = (p: number) => `${Math.round(p * 1000).toLocaleString("vi-VN")}đ`;

interface Alerted {
  date: string;
  picks: string[];
  leads: string[];
}

/** Chọn mã/ngành mới xuất hiện so với các lần báo trước trong ngày — pure, test được. */
export function newOpportunities(r: SectorStrength, seen: Alerted) {
  const picks = r.topPicks.filter(
    (p) => p.close >= p.buyZone[0] && p.close <= p.buyZone[1] && !seen.picks.includes(p.ticker),
  );
  const leads = r.sectors.filter((s) => s.trend === "lead" && !seen.leads.includes(s.sector)).map((s) => s.sector);
  return { picks, leads };
}

/**
 * Báo Telegram cơ hội trong phiên: mã đáng chú ý vừa nằm trong vùng mua,
 * ngành vừa lên nhóm dẫn đầu. Mỗi mã/ngành chỉ báo 1 lần/ngày. Gọi từ
 * watcher (ping mỗi phút) nhưng tự giãn 5 phút/lần.
 */
export async function runSectorAlerts(): Promise<number> {
  if (!inVnSession() || !(await getBool("scanEnabled")) || (await getBool("killSwitch"))) return 0;
  if (Date.now() - (Number(await getSetting("sectorAlertAt")) || 0) < ALERT_EVERY_MS) return 0;
  await setSetting("sectorAlertAt", String(Date.now()));

  const today = vnToday();
  const prev = JSON.parse((await getSetting("sectorAlerted")) || "{}") as Partial<Alerted>;
  const seen: Alerted = prev.date === today ? { date: today, picks: prev.picks ?? [], leads: prev.leads ?? [] } : { date: today, picks: [], leads: [] };
  const { picks, leads } = newOpportunities(await live(), seen);
  if (!picks.length && !leads.length) return 0;

  const n = vnNow();
  const hhmm = `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  await sendTelegram(
    [
      `⚡ <b>CƠ HỘI TRONG PHIÊN</b> · ${hhmm}`,
      ...(leads.length ? [`🚀 Ngành vừa dẫn đầu: ${leads.map(esc).join(", ")}`] : []),
      ...picks.map(
        (p) =>
          `🎯 <b>${p.ticker}</b> (${esc(p.sector ?? "")}) giá ${dong(p.close)} — trong vùng mua ${dong(p.buyZone[0])}–${dong(p.buyZone[1])}\n` +
          `    cắt lỗ ${dong(p.stop)} (−${p.riskPct.toFixed(1)}%) · chốt lời ${dong(p.target)} (+${p.upsidePct.toFixed(1)}%)`,
      ),
      `<i>Gợi ý kỹ thuật tự động, chưa chứng minh có lãi — tập bằng tiền ảo trước. Xem: /nganh</i>`,
    ].join("\n"),
    undefined,
    { kind: "sector", userId: null, ticker: picks.length === 1 ? picks[0].ticker : undefined },
  );
  await setSetting(
    "sectorAlerted",
    JSON.stringify({ date: today, picks: [...seen.picks, ...picks.map((p) => p.ticker)], leads: [...seen.leads, ...leads] }),
  );
  return picks.length + leads.length;
}
