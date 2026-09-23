/** Diễn biến giá tham chiếu sau tín hiệu — không phải PnL thực thi hay expectancy. */

export const LOOKBACK_CALENDAR_DAYS = 90;
export const HORIZONS = [5, 10, 20] as const;
export const SAMPLE_WARN_BELOW = 20;

export const LIMITATIONS = [
  "Báo cáo hồi cố (retrospective): không phải đánh giá live / walk-forward.",
  "Chỉ theo dõi close so với giá entry ghi trên tín hiệu — không phải PnL khớp lệnh, phí, trượt giá hay win-rate.",
  "Không suy ra xác suất lãi trong tương lai.",
  "Mã hủy niêm yết / mất dữ liệu biến mất khỏi mẫu (survivorship).",
  "Nến có thể đã bị nhân hệ số GDKHQ — không phải giá giao dịch gốc.",
  "Tín hiệu đã xóa không còn trong DB nên không vào mẫu.",
  "Setup trong phiên không được lưu; chỉ có snapshot EOD.",
  "Tín hiệu tạo sau giờ mở phiên kế không tính quan sát đúng thời điểm (PIT).",
] as const;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const CLOSE_MINUTE = 15 * 60;

export type SignalSnapshot = {
  id: number;
  strategy: string;
  ticker: string;
  date: string;
  entry: number;
  status: string;
  createdAt: Date;
};

export type BarClose = { ticker: string; date: string; close: number };

export type HorizonStats = {
  sessions: (typeof HORIZONS)[number];
  mature: number;
  pending: number;
  missingData: number;
  backfilled: number;
  mean: number | null;
  median: number | null;
  positiveCount: number;
  positiveDenom: number;
  positiveFraction: number | null;
  sampleWarning: string | null;
};

export type EvidenceGroup = {
  strategy: string;
  date: string;
  n: number;
  statusCounts: Record<string, number>;
  backfilled: number;
  horizons: HorizonStats[];
};

export type SignalEvidenceReport = {
  retrospective: true;
  lookbackCalendarDays: number;
  asOf: string;
  periodStart: string;
  periodEnd: string;
  analyzed: number;
  rejected: number;
  statusCounts: Record<string, number>;
  horizons: HorizonStats[];
  groups: EvidenceGroup[];
  limitations: readonly string[];
};

export type QueryWindow = {
  from: string;
  today: string;
  barTo: string;
  sessionClosed: boolean;
  lastCompleteDate: string | null;
};

export function vnDate(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

export function vnMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return (
    Number(parts.find((p) => p.type === "hour")?.value ?? 0) * 60 +
    Number(parts.find((p) => p.type === "minute")?.value ?? 0)
  );
}

export function addCalendarDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function evidenceQueryWindow(now: Date): QueryWindow {
  const today = vnDate(now);
  const sessionClosed = vnMinutes(now) >= CLOSE_MINUTE;
  return {
    from: addCalendarDays(today, -LOOKBACK_CALENDAR_DAYS),
    today,
    barTo: today,
    sessionClosed,
    lastCompleteDate: sessionClosed ? today : null,
  };
}

export function computeSignalEvidence(input: {
  signals: SignalSnapshot[];
  bars: BarClose[];
  calendar: string[];
  now: Date;
}): SignalEvidenceReport {
  const today = vnDate(input.now);
  const from = addCalendarDays(today, -LOOKBACK_CALENDAR_DAYS);
  const closed = vnMinutes(input.now) >= CLOSE_MINUTE;
  const calendar = uniqueDates(input.calendar).filter((d) => d <= today && (d < today || closed));
  const lastUsable = calendar[calendar.length - 1] ?? (closed ? today : addCalendarDays(today, -1));

  const closes = new Map<string, Map<string, number>>();
  for (const b of input.bars) {
    if (!isIsoDate(b.date) || !Number.isFinite(b.close) || b.close <= 0) continue;
    const t = b.ticker.trim();
    if (!t) continue;
    const m = closes.get(t) ?? new Map();
    if (!m.has(b.date)) m.set(b.date, b.close);
    closes.set(t, m);
  }

  const seenId = new Set<number>();
  const seenKey = new Set<string>();
  let rejected = 0;
  const valid: (SignalSnapshot & { backfilled: boolean })[] = [];

  for (const s of input.signals) {
    if (
      !Number.isFinite(s.id) ||
      !s.strategy ||
      !s.ticker?.trim() ||
      !isIsoDate(s.date) ||
      s.date < from ||
      s.date > today ||
      !Number.isFinite(s.entry) ||
      s.entry <= 0 ||
      !(s.createdAt instanceof Date) ||
      !Number.isFinite(s.createdAt.getTime())
    ) {
      rejected++;
      continue;
    }
    if (seenId.has(s.id) || seenKey.has(`${s.strategy}\0${s.ticker}\0${s.date}`)) {
      rejected++;
      continue;
    }
    seenId.add(s.id);
    seenKey.add(`${s.strategy}\0${s.ticker}\0${s.date}`);
    valid.push({ ...s, ticker: s.ticker.trim(), backfilled: isBackfilled(s, input.calendar) });
  }

  const statusCounts: Record<string, number> = {};
  const groupMap = new Map<string, Array<SignalSnapshot & { backfilled: boolean }>>();
  for (const s of valid) {
    statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1;
    const k = `${s.strategy}\0${s.date}`;
    const arr = groupMap.get(k) ?? [];
    arr.push(s);
    groupMap.set(k, arr);
  }

  const classify = (rows: (SignalSnapshot & { backfilled: boolean })[]) =>
    HORIZONS.map((h) => horizonStats(h, rows, calendar, closes));

  const groups: EvidenceGroup[] = [...groupMap.entries()]
    .map(([k, rows]) => {
      const [strategy, date] = k.split("\0");
      const sc: Record<string, number> = {};
      for (const r of rows) sc[r.status] = (sc[r.status] ?? 0) + 1;
      return {
        strategy,
        date,
        n: rows.length,
        statusCounts: sc,
        backfilled: rows.filter((r) => r.backfilled).length,
        horizons: classify(rows),
      };
    })
    .sort((a, b) => (a.date === b.date ? a.strategy.localeCompare(b.strategy) : b.date.localeCompare(a.date)));

  const dates = valid.map((s) => s.date).sort();
  return {
    retrospective: true,
    lookbackCalendarDays: LOOKBACK_CALENDAR_DAYS,
    asOf: today,
    periodStart: dates[0] ?? from,
    periodEnd: lastUsable,
    analyzed: valid.length,
    rejected,
    statusCounts,
    horizons: classify(valid),
    groups,
    limitations: LIMITATIONS,
  };
}

function isBackfilled(s: SignalSnapshot, calendar: string[]): boolean {
  const next = uniqueDates(calendar).find((d) => d > s.date) ?? nextWeekday(s.date);
  return s.createdAt.getTime() > new Date(`${next}T09:00:00+07:00`).getTime();
}

function horizonStats(
  sessions: (typeof HORIZONS)[number],
  rows: (SignalSnapshot & { backfilled: boolean })[],
  calendar: string[],
  closes: Map<string, Map<string, number>>,
): HorizonStats {
  const rets: number[] = [];
  let pending = 0;
  let missingData = 0;
  let backfilled = 0;
  for (const s of rows) {
    const window = datesAfter(calendar, s.date, sessions);
    if (window.length < sessions) {
      pending++;
      continue;
    }
    const book = closes.get(s.ticker);
    let miss = false;
    for (const d of window) {
      const px = book?.get(d);
      if (px === undefined || !Number.isFinite(px)) {
        miss = true;
        break;
      }
    }
    if (miss) {
      missingData++;
      continue;
    }
    if (s.backfilled) {
      backfilled++;
      continue;
    }
    rets.push(book!.get(window[sessions - 1])! / s.entry - 1);
  }
  const mature = rets.length;
  const mean = mature ? rets.reduce((a, b) => a + b, 0) / mature : null;
  const positiveCount = rets.filter((x) => x > 0).length;
  return {
    sessions,
    mature,
    pending,
    missingData,
    backfilled,
    mean,
    median: median(rets),
    positiveCount,
    positiveDenom: mature,
    positiveFraction: mature ? positiveCount / mature : null,
    sampleWarning:
      mature > 0 && mature < SAMPLE_WARN_BELOW
        ? `mẫu n=${mature} < ${SAMPLE_WARN_BELOW} — không suy ra xác suất lãi`
        : null,
  };
}

function datesAfter(calendar: string[], date: string, n: number): string[] {
  const out: string[] = [];
  for (const d of calendar) {
    if (d > date) {
      out.push(d);
      if (out.length === n) break;
    }
  }
  return out;
}

function uniqueDates(xs: string[]): string[] {
  return [...new Set(xs.filter(isIsoDate))].sort();
}

function isIsoDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function nextWeekday(iso: string): string {
  let d = addCalendarDays(iso, 1);
  for (let i = 0; i < 8; i++) {
    const day = new Date(d + "T00:00:00Z").getUTCDay();
    if (day !== 0 && day !== 6) return d;
    d = addCalendarDays(d, 1);
  }
  return d;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const signedPct = (v: number | null) => (v === null ? null : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);

/** Một câu cho người mới: giá sau tín hiệu đi đâu — không phải lãi/lỗ đã khớp. */
export function plainEvidenceVerdict(r: Pick<SignalEvidenceReport, "analyzed" | "horizons" | "periodStart" | "periodEnd">): {
  title: string;
  line: string;
} {
  const h5 = r.horizons.find((h) => h.sessions === 5);
  if (!r.analyzed) {
    return { title: "Chưa có gì để kiểm tra", line: "90 ngày qua app chưa lưu tín hiệu nào." };
  }
  if (!h5 || h5.mature === 0) {
    return {
      title: "Mới báo, chưa đủ ngày",
      line: `Có ${r.analyzed} tín hiệu từ ${r.periodStart} đến ${r.periodEnd}. Chưa mã nào đủ 5 phiên sau ngày báo để so giá.`,
    };
  }
  const up = h5.positiveDenom ? ` ${h5.positiveCount}/${h5.positiveDenom} mã giá cao hơn lúc báo.` : "";
  const thin = h5.mature < 20 || h5.sampleWarning ? " Mẫu còn ít — chưa kết luận chiến lược có lãi." : "";
  return {
    title: "Sau 5 phiên, giá đi đâu?",
    line: `Trong ${h5.mature} tín hiệu đã qua 5 phiên, giá đóng cửa trung bình ${signedPct(h5.mean)} so với giá ghi trên tín hiệu.${up}${thin}`,
  };
}
