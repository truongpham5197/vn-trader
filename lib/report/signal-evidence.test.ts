import { describe, expect, it } from "vitest";
import {
  LOOKBACK_CALENDAR_DAYS,
  SAMPLE_WARN_BELOW,
  computeSignalEvidence,
  evidenceQueryWindow,
} from "./signal-evidence";

const CAL = [
  "2026-06-01",
  "2026-06-02",
  "2026-06-03",
  "2026-06-04",
  "2026-06-05",
  "2026-06-08",
  "2026-06-09",
  "2026-06-10",
  "2026-06-11",
  "2026-06-12",
  "2026-06-15",
  "2026-06-16",
  "2026-06-17",
  "2026-06-18",
  "2026-06-19",
  "2026-06-22",
  "2026-06-23",
  "2026-06-24",
  "2026-06-25",
  "2026-06-26",
  "2026-06-29",
  "2026-06-30",
];

function atVn(isoDate: string, hm: string) {
  return new Date(`${isoDate}T${hm}:00+07:00`);
}

function sig(p: {
  id?: number;
  strategy?: string;
  ticker?: string;
  date?: string;
  entry?: number;
  status?: string;
  createdAt?: Date;
} = {}) {
  return {
    id: p.id ?? 1,
    strategy: p.strategy ?? "breakout-20",
    ticker: p.ticker ?? "VNM",
    date: p.date ?? "2026-06-01",
    entry: p.entry ?? 100,
    status: p.status ?? "notified",
    createdAt: p.createdAt ?? atVn("2026-06-01", "16:00"),
  };
}

function closes(ticker: string, dates: string[], px: number | number[]) {
  return dates.map((date, i) => ({
    ticker,
    date,
    close: Array.isArray(px) ? px[i]! : px,
  }));
}

describe("evidenceQueryWindow", () => {
  it("90 ngày lịch, bars không vượt quá hôm nay giờ VN", () => {
    const w = evidenceQueryWindow(atVn("2026-09-23", "16:10"));
    expect(LOOKBACK_CALENDAR_DAYS).toBe(90);
    expect(w.from).toBe("2026-06-25");
    expect(w.today).toBe("2026-09-23");
    expect(w.barTo).toBe("2026-09-23");
  });

  it("trước 15h VN thì không lấy nến hôm nay làm mốc đóng", () => {
    const w = evidenceQueryWindow(atVn("2026-09-23", "10:00"));
    expect(w.today).toBe("2026-09-23");
    expect(w.sessionClosed).toBe(false);
    expect(w.lastCompleteDate).toBeNull();
  });
});

describe("computeSignalEvidence", () => {
  const now = atVn("2026-06-30", "16:00");

  it("lãi/lỗ 5 phiên = close phiên thứ 5 sau ngày tín hiệu so với giá entry", () => {
    // 01/06 → 5 phiên sau: 02,03,04,05,08 — close 08/06 = 110, entry 100 → +10%
    const r = computeSignalEvidence({
      signals: [sig({ createdAt: atVn("2026-06-01", "16:00") })],
      bars: closes("VNM", CAL, CAL.map((d) => (d === "2026-06-08" ? 110 : 100))),
      calendar: CAL,
      now,
    });
    expect(r.retrospective).toBe(true);
    expect(r.analyzed).toBe(1);
    expect(r.periodStart).toBe("2026-06-01");
    const h5 = r.horizons.find((h) => h.sessions === 5)!;
    expect(h5.mature).toBe(1);
    expect(h5.pending).toBe(0);
    expect(h5.missingData).toBe(0);
    expect(h5.mean).toBeCloseTo(0.1);
    expect(h5.median).toBeCloseTo(0.1);
    expect(h5.positiveCount).toBe(1);
    expect(h5.positiveDenom).toBe(1);
    expect(h5.positiveFraction).toBeCloseTo(1);
  });

  it("thiếu 1 phiên trên lịch → missing-data, không nhảy cóc sang nến kế của mã", () => {
    const sparse = CAL.filter((d) => d !== "2026-06-04");
    const r = computeSignalEvidence({
      signals: [sig({})],
      bars: closes("VNM", sparse, 110),
      calendar: CAL,
      now,
    });
    const h5 = r.horizons.find((h) => h.sessions === 5)!;
    expect(h5.mature).toBe(0);
    expect(h5.missingData).toBe(1);
    expect(h5.mean).toBeNull();
    expect(h5.positiveFraction).toBeNull();
  });

  it("chưa đủ phiên trên lịch → pending, không bịa nến", () => {
    const r = computeSignalEvidence({
      signals: [sig({ date: "2026-06-22" })],
      bars: closes("VNM", CAL, 100),
      calendar: CAL,
      now: atVn("2026-06-26", "16:00"),
    });
    const h5 = r.horizons.find((h) => h.sessions === 5)!;
    const h20 = r.horizons.find((h) => h.sessions === 20)!;
    expect(h5.pending).toBe(1);
    expect(h5.mature).toBe(0);
    expect(h20.pending).toBe(1);
  });

  it("nến hôm nay trước 15h VN là chưa đóng — không dùng close", () => {
    const r = computeSignalEvidence({
      signals: [sig({})],
      bars: closes("VNM", CAL, CAL.map((d) => (d === "2026-06-08" ? 999 : 100))),
      calendar: CAL,
      now: atVn("2026-06-08", "10:30"),
    });
    const h5 = r.horizons.find((h) => h.sessions === 5)!;
    expect(h5.mature).toBe(0);
    expect(h5.pending).toBe(1);
  });

  it("sau 15h VN được dùng nến hôm nay nếu có đủ cửa sổ", () => {
    const r = computeSignalEvidence({
      signals: [sig({})],
      bars: closes("VNM", CAL, CAL.map((d) => (d === "2026-06-08" ? 105 : 100))),
      calendar: CAL,
      now: atVn("2026-06-08", "15:01"),
    });
    const h5 = r.horizons.find((h) => h.sessions === 5)!;
    expect(h5.mature).toBe(1);
    expect(h5.mean).toBeCloseTo(0.05);
  });

  it("loại tín hiệu trùng và giá/ngày không hữu hạn", () => {
    const r = computeSignalEvidence({
      signals: [
        sig({ id: 1, entry: 100 }),
        sig({ id: 1, entry: 101 }),
        sig({ id: 2, ticker: "VCB", entry: Number.NaN }),
        sig({ id: 3, ticker: "GAS", date: "bad" }),
        sig({ id: 4, ticker: "ACB", entry: Number.POSITIVE_INFINITY }),
      ],
      bars: [
        ...closes("VNM", CAL, 100),
        { ticker: "VNM", date: "nope", close: 1 },
        { ticker: "VNM", date: "2026-06-02", close: Number.NaN },
      ],
      calendar: CAL,
      now,
    });
    expect(r.rejected).toBeGreaterThanOrEqual(3);
    expect(r.analyzed).toBe(1);
  });

  it("createdAt sau giờ mở phiên kế → không tính PIT, vẫn đánh dấu hồi cố", () => {
    const r = computeSignalEvidence({
      signals: [sig({ createdAt: atVn("2026-06-02", "09:01") })],
      bars: closes("VNM", CAL, 110),
      calendar: CAL,
      now,
    });
    expect(r.retrospective).toBe(true);
    const h5 = r.horizons.find((h) => h.sessions === 5)!;
    expect(h5.backfilled).toBe(1);
    expect(h5.mature).toBe(0);
    expect(h5.mean).toBeNull();
    expect(r.groups[0]?.backfilled).toBe(1);
  });

  it("createdAt trước 9h phiên kế vẫn là quan sát đúng thời điểm", () => {
    const r = computeSignalEvidence({
      signals: [sig({ createdAt: atVn("2026-06-02", "08:59") })],
      bars: closes("VNM", CAL, CAL.map((d) => (d === "2026-06-08" ? 110 : 100))),
      calendar: CAL,
      now,
    });
    const h5 = r.horizons.find((h) => h.sessions === 5)!;
    expect(h5.backfilled).toBe(0);
    expect(h5.mature).toBe(1);
  });

  it("gom mọi trạng thái, không lọc theo lệnh user; mean/median/+k/n có mẫu số", () => {
    const r = computeSignalEvidence({
      signals: [
        sig({ id: 1, status: "skipped", entry: 100 }),
        sig({ id: 2, ticker: "VCB", status: "expired", entry: 50 }),
        sig({ id: 3, ticker: "GAS", status: "taken", entry: 80 }),
      ],
      bars: [
        ...closes(
          "VNM",
          CAL,
          CAL.map((d) => (d === "2026-06-08" ? 110 : 100)),
        ),
        ...closes(
          "VCB",
          CAL,
          CAL.map((d) => (d === "2026-06-08" ? 40 : 50)),
        ),
        ...closes(
          "GAS",
          CAL,
          CAL.map((d) => (d === "2026-06-08" ? 80 : 80)),
        ),
      ],
      calendar: CAL,
      now,
    });
    expect(r.analyzed).toBe(3);
    expect(r.statusCounts.skipped).toBe(1);
    expect(r.statusCounts.expired).toBe(1);
    expect(r.statusCounts.taken).toBe(1);
    const h5 = r.horizons.find((h) => h.sessions === 5)!;
    expect(h5.mature).toBe(3);
    expect(h5.mean).toBeCloseTo((0.1 + -0.2 + 0) / 3);
    expect(h5.median).toBeCloseTo(0);
    expect(h5.positiveCount).toBe(1);
    expect(h5.positiveDenom).toBe(3);
    expect(h5.positiveFraction).toBeCloseTo(1 / 3);
    expect(h5.sampleWarning).toContain(String(SAMPLE_WARN_BELOW));
  });

  it("nhóm theo chiến lược và ngày tín hiệu", () => {
    const r = computeSignalEvidence({
      signals: [
        sig({ id: 1, strategy: "A", date: "2026-06-01" }),
        sig({ id: 2, strategy: "A", ticker: "VCB", date: "2026-06-01" }),
        sig({ id: 3, strategy: "B", date: "2026-06-01" }),
        sig({ id: 4, strategy: "A", date: "2026-06-02" }),
      ],
      bars: [...closes("VNM", CAL, 100), ...closes("VCB", CAL, 100)],
      calendar: CAL,
      now,
    });
    expect(r.groups).toHaveLength(3);
    const a1 = r.groups.find((g) => g.strategy === "A" && g.date === "2026-06-01");
    expect(a1?.n).toBe(2);
  });

  it("5 phiên có thể chín trong khi 20 phiên còn pending", () => {
    const r = computeSignalEvidence({
      signals: [sig({ date: "2026-06-01" })],
      bars: closes("VNM", CAL, 100),
      calendar: CAL,
      now: atVn("2026-06-08", "16:00"),
    });
    expect(r.horizons.find((h) => h.sessions === 5)?.mature).toBe(1);
    expect(r.horizons.find((h) => h.sessions === 10)?.pending).toBe(1);
    expect(r.horizons.find((h) => h.sessions === 20)?.pending).toBe(1);
  });
});
