import { describe, expect, it } from "vitest";
import { tickerLiquidOnDate, VN30_TICKERS, VN30_MEMBERSHIP_NOTE } from "./universe";
import { VN30 } from "../data/vn30";

function bars(spec: { date: string; value: number }[]) {
  return spec.map((s) => ({
    date: s.date,
    open: 50,
    high: 50,
    low: 50,
    close: 50,
    volume: 1,
    value: s.value,
  }));
}

describe("tickerLiquidOnDate — as-of, không dùng 20 phiên mới nhất hiện tại", () => {
  const dates = Array.from({ length: 40 }, (_, i) => {
    const d = new Date(Date.UTC(2024, 0, 2 + i));
    return d.toISOString().slice(0, 10);
  });
  const min = 5e9;

  it("đủ 20 phiên as-of ngày D và TB >= ngưỡng → eligible", () => {
    const b = bars(dates.map((d) => ({ date: d, value: min })));
    expect(tickerLiquidOnDate(b, dates[19], min)).toBe(true);
  });

  it("ngày D chỉ nhìn bars <= D — illiquid sớm dù cuối series liquid", () => {
    const b = bars(dates.map((d, i) => ({ date: d, value: i < 20 ? min / 10 : min })));
    expect(tickerLiquidOnDate(b, dates[19], min)).toBe(false);
    expect(tickerLiquidOnDate(b, dates[39], min)).toBe(true);
  });

  it("thiếu 20 phiên as-of → không eligible", () => {
    const b = bars(dates.slice(0, 10).map((d) => ({ date: d, value: min })));
    expect(tickerLiquidOnDate(b, dates[9], min)).toBe(false);
  });
});

describe("VN30 dùng list dùng chung", () => {
  it("trùng lib/data/vn30, ghi rõ giới hạn thành viên lịch sử", () => {
    expect(VN30_TICKERS).toEqual([...VN30]);
    expect(VN30_MEMBERSHIP_NOTE.toLowerCase()).toMatch(/lịch sử|sống sót|surviv/);
  });
});
