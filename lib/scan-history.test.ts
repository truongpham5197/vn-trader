import { describe, expect, it } from "vitest";
import {
  avgValueNewest,
  batchCompletedDate,
  canGenerateBuy,
  dropUnfinishedSession,
  historyCutoffIso,
  isFreshVsBatch,
  maxRequiredBars,
  requiredHistory,
  shouldPersistScanDate,
  toAscendingBars,
} from "./scan-history";
import type { StrategyDef } from "./strategy/types";

const stub = (n: number): StrategyDef => ({
  fn: () => null,
  defaults: {},
  requiredBars: () => n,
});

describe("requiredHistory / cutoff", () => {
  it("pullback 66 nến cần cutoff dài hơn 60 nến (BARS_NEEDED cũ)", () => {
    const now = Date.parse("2026-09-23T10:00:00Z");
    const h60 = requiredHistory(60, now);
    const h66 = requiredHistory(66, now);
    expect(h66.bars).toBe(66);
    expect(h66.cutoff < h60.cutoff).toBe(true);
    expect(historyCutoffIso(66, now)).toBe(h66.cutoff);
  });

  it("maxRequiredBars lấy yêu cầu dài nhất của strategy đang bật", () => {
    expect(
      maxRequiredBars([
        { def: stub(36), params: {} },
        { def: stub(66), params: {} },
        { def: stub(60), params: {} },
      ]),
    ).toBe(66);
  });
});

describe("toAscendingBars", () => {
  it("không mutate mảng newest-first (tránh thanh khoản lấy 20 nến cũ)", () => {
    const rows = [
      { date: "2026-09-22", open: 2, high: 2, low: 2, close: 2, volume: 2, value: 2e9 },
      { date: "2026-09-21", open: 1, high: 1, low: 1, close: 1, volume: 1, value: 1e9 },
    ];
    const copy = rows.slice();
    const bars = toAscendingBars(rows);
    expect(rows).toEqual(copy);
    expect(bars.map((b) => b.date)).toEqual(["2026-09-21", "2026-09-22"]);
    expect(bars[0]).toEqual({
      date: "2026-09-21",
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
    });
  });
});

describe("avgValueNewest", () => {
  it("trung bình GTGD theo nến mới nhất, không phải 20 nến già sau reverse", () => {
    const rows = [
      { value: 1e9 },
      { value: 1e9 },
      { value: 99e9 },
      { value: 99e9 },
    ];
    expect(avgValueNewest(rows, 2)).toBe(1e9);
  });
});

describe("batchCompletedDate / freshness", () => {
  it("trong phiên bỏ nến hôm nay chưa đóng, lấy phiên hoàn tất của batch", () => {
    expect(
      batchCompletedDate(["2026-09-23", "2026-09-22", "2026-09-23"], {
        today: "2026-09-23",
        inSession: true,
      }),
    ).toBe("2026-09-22");
  });

  it("sau đóng cửa giữ nến hôm nay nếu batch đã có", () => {
    expect(
      batchCompletedDate(["2026-09-23", "2026-09-22"], {
        today: "2026-09-23",
        inSession: false,
      }),
    ).toBe("2026-09-23");
  });

  it("ngày lễ không suy từ thứ trong tuần — chỉ theo nến batch", () => {
    // Thứ 2 lễ: batch max = thứ 6 trước đó, dù today là thứ 2
    expect(
      batchCompletedDate(["2026-09-18", "2026-09-17"], {
        today: "2026-09-21",
        inSession: true,
      }),
    ).toBe("2026-09-18");
  });

  it("mã last bar cũ hơn phiên hoàn tất của batch → không tươi", () => {
    expect(isFreshVsBatch("2026-09-18", "2026-09-22")).toBe(false);
    expect(isFreshVsBatch("2026-09-22", "2026-09-22")).toBe(true);
  });

  it("dropUnfinishedSession gỡ nến today khi đang trong phiên", () => {
    const rows = [{ date: "2026-09-23" }, { date: "2026-09-22" }];
    expect(dropUnfinishedSession(rows, { today: "2026-09-23", inSession: true }).map((r) => r.date)).toEqual([
      "2026-09-22",
    ]);
    expect(dropUnfinishedSession(rows, { today: "2026-09-23", inSession: false })).toEqual(rows);
  });
});

describe("canGenerateBuy / persist date", () => {
  it("held/watchlist illiquid hoặc thiếu history không được BUY mới", () => {
    expect(canGenerateBuy({ liquid: false, historyOk: true })).toBe(false);
    expect(canGenerateBuy({ liquid: true, historyOk: false })).toBe(false);
    expect(canGenerateBuy({ liquid: true, historyOk: true })).toBe(true);
  });

  it("không ghi đè latestScanDate bằng ngày cũ hơn", () => {
    expect(shouldPersistScanDate("2026-09-22", "2026-09-21")).toBe(false);
    expect(shouldPersistScanDate("2026-09-22", "2026-09-22")).toBe(false);
    expect(shouldPersistScanDate("2026-09-21", "2026-09-22")).toBe(true);
    expect(shouldPersistScanDate("", "2026-09-22")).toBe(true);
    expect(shouldPersistScanDate("2026-09-22", null)).toBe(false);
  });
});
