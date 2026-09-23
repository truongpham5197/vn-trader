export interface PriceEvidence {
  last: number | null;
  source?: "minute" | "daily" | "unavailable";
  asOf?: string | null;
  date?: string | null;
}

const MAX_CALENDAR_AGE = 7 * 86400e3; // fail closed khi lịch/sync thiếu; không giả định lịch nghỉ lễ
const validDate = (date: string | null | undefined): date is string =>
  !!date && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date));

export function signalExpired(date: string, latestSession: string | null | undefined, now = new Date()): boolean {
  return !validDate(date) || (!!latestSession && date < latestSession)
    || now.getTime() - Date.parse(`${date}T00:00:00+07:00`) > MAX_CALENDAR_AGE;
}

/** Timestamp nến nguồn, không phải timestamp HTTP/cache. Ngoài giờ cần biết phiên đối chiếu. */
export function quoteFresh(q: PriceEvidence | null | undefined, now = new Date(), latestSession?: string | null): boolean {
  if (!q || q.last === null || !Number.isFinite(q.last) || q.last <= 0 || !validDate(q.date)) return false;
  const vn = new Date(now.getTime() + 7 * 3600e3);
  const day = vn.getUTCDay();
  const minutes = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  const during = day >= 1 && day <= 5 && minutes >= 540 && minutes < 900;
  const age = now.getTime() - Date.parse(q.asOf ?? "");
  if (during) return q.source === "minute" && q.date === vn.toISOString().slice(0, 10) && age >= 0 && age <= 180_000;
  const dateAge = now.getTime() - Date.parse(`${q.date}T00:00:00+07:00`);
  return (q.source === "minute" || q.source === "daily") && !!latestSession && q.date >= latestSession
    && dateAge >= 0 && dateAge <= MAX_CALENDAR_AGE;
}
