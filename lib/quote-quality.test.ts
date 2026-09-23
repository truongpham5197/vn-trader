import { describe, expect, it } from "vitest";
import { quoteFresh, signalExpired } from "./quote-quality";

const now = new Date("2026-09-23T03:00:00Z");
describe("quote freshness", () => {
  it("không coi fallback daily hoặc timestamp lần fetch là giá realtime", () => {
    expect(quoteFresh({ last: 20, source: "daily", asOf: null, date: "2026-09-23" }, now)).toBe(false);
    expect(quoteFresh({ last: 20, source: "minute", asOf: "2026-09-23T02:59:00Z", date: "2026-09-23" }, now)).toBe(true);
    expect(quoteFresh({ last: 20, source: "minute", asOf: "2026-09-23T02:00:00Z", date: "2026-09-23" }, now)).toBe(false);
    expect(quoteFresh({ last: 20, source: "minute", asOf: "2026-09-23T04:00:00Z", date: "2026-09-23" }, now)).toBe(false);
    expect(quoteFresh({ last: 20 }, now)).toBe(false);
  });
  it("ngoài giờ chỉ chấp nhận ngày giá đúng phiên đã biết và không quá cũ", () => {
    const after = new Date("2026-09-23T12:00:00Z");
    expect(quoteFresh({ last: 20, source: "daily", date: "2026-09-23" }, after, "2026-09-23")).toBe(true);
    expect(quoteFresh({ last: 20, source: "daily", date: "2026-09-22" }, after, "2026-09-23")).toBe(false);
    expect(quoteFresh({ last: 20, source: "daily", date: "2026-08-01" }, after, "2026-08-01")).toBe(false);
  });
});

describe("signal expiry", () => {
  it("dùng phiên nến hoàn tất, không hết hạn vì qua đêm hoặc cuối tuần", () => {
    expect(signalExpired("2026-09-18", "2026-09-18", new Date("2026-09-21T03:00:00Z"))).toBe(false);
    expect(signalExpired("2026-09-18", "2026-09-21", new Date("2026-09-21T10:00:00Z"))).toBe(true);
    expect(signalExpired("2026-08-01", "2026-08-01", now)).toBe(true);
  });
});
