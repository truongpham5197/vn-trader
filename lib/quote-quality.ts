export interface PriceEvidence {
  last: number | null;
  source?: "minute" | "daily" | "unavailable";
  asOf?: string | null;
  date?: string | null;
}

const MAX_CALENDAR_AGE = 7 * 86400e3; // fail closed khi lịch/sync thiếu; không giả định lịch nghỉ lễ
const validDate = (date: string | null | undefined): date is string =>
  !!date && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date));

export type QuoteHalt = "lunch" | "atc";

function vnClock(now: Date) {
  const vn = new Date(now.getTime() + 7 * 3600e3);
  return {
    day: vn.getUTCDay(),
    minutes: vn.getUTCHours() * 60 + vn.getUTCMinutes(),
    date: vn.toISOString().slice(0, 10),
  };
}

/** Nghỉ khớp liên tục trong ngày: nghỉ trưa 11:30–13:00, sau ATC 14:45–15:00. */
export function quoteHalt(now = new Date()): QuoteHalt | null {
  const { day, minutes } = vnClock(now);
  if (day < 1 || day > 5) return null;
  if (minutes >= 11 * 60 + 30 && minutes < 13 * 60) return "lunch";
  if (minutes >= 14 * 60 + 45 && minutes < 15 * 60) return "atc";
  return null;
}

/** Giá khớp cuối của phiên liên tục vừa xong — không lấy nến giữa buổi. */
function haltPrintOk(q: PriceEvidence, now: Date, halt: QuoteHalt): boolean {
  if (q.source !== "minute" || !validDate(q.date)) return false;
  const asOf = Date.parse(q.asOf ?? "");
  if (!Number.isFinite(asOf) || asOf > now.getTime()) return false;
  const quote = vnClock(new Date(asOf));
  const today = vnClock(now);
  if (q.date !== today.date || quote.date !== today.date) return false;
  const floor = halt === "lunch" ? 11 * 60 + 25 : 14 * 60 + 40;
  return quote.minutes >= floor && quote.minutes <= today.minutes;
}

export function signalExpired(date: string, latestSession: string | null | undefined, now = new Date()): boolean {
  return !validDate(date) || (!!latestSession && date < latestSession)
    || now.getTime() - Date.parse(`${date}T00:00:00+07:00`) > MAX_CALENDAR_AGE;
}

/** Timestamp nến nguồn, không phải timestamp HTTP/cache. Ngoài giờ cần biết phiên đối chiếu. */
export function quoteFresh(q: PriceEvidence | null | undefined, now = new Date(), latestSession?: string | null): boolean {
  if (!q || q.last === null || !Number.isFinite(q.last) || q.last <= 0 || !validDate(q.date)) return false;
  const halt = quoteHalt(now);
  if (halt) return haltPrintOk(q, now, halt);
  const { day, minutes, date } = vnClock(now);
  const during = day >= 1 && day <= 5 && minutes >= 540 && minutes < 900;
  const age = now.getTime() - Date.parse(q.asOf ?? "");
  if (during) return q.source === "minute" && q.date === date && age >= 0 && age <= 180_000;
  const dateAge = now.getTime() - Date.parse(`${q.date}T00:00:00+07:00`);
  return (q.source === "minute" || q.source === "daily") && !!latestSession && q.date >= latestSession
    && dateAge >= 0 && dateAge <= MAX_CALENDAR_AGE;
}

/** Câu nguồn giá cho phần "Vì sao" — nói rõ khi không phải giá đang chạy. */
export function quoteNote(q: PriceEvidence | null | undefined, now = new Date()): string {
  const time = q?.asOf
    ? new Date(q.asOf).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" })
    : null;
  const halt = quoteHalt(now);
  if (halt && q && quoteFresh(q, now)) {
    const at = time ? ` ${time}` : "";
    return halt === "lunch"
      ? `Nghỉ trưa — giá khớp cuối buổi sáng${at}. Không phải giá đang chạy.`
      : `Sắp đóng cửa — giá khớp cuối${at}. Không còn khớp liên tục.`;
  }
  if (q?.source === "minute" && time) return `Giá nến 1 phút: ${time} (${q.date})`;
  if (q?.source === "daily") return `Giá dự phòng nến ngày ${q.date} — không phải realtime`;
  return "Chưa có nguồn giá mới";
}
