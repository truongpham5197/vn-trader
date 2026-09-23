import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./data/dnse", () => ({ fetchDailyBars: vi.fn(), fetchMinuteBars: vi.fn() }));
import { fetchDailyBars, fetchMinuteBars } from "./data/dnse";
import { getQuote } from "./price";

beforeEach(() => { vi.clearAllMocks(); });
describe("getQuote provenance", () => {
  it("giữ timestamp nến phút, không gắn thời gian fetch làm thời gian giá", async () => {
    vi.mocked(fetchMinuteBars).mockResolvedValue([{ time: new Date("2026-09-23T03:00:00Z"), close: 20 }]);
    vi.mocked(fetchDailyBars).mockResolvedValue([]);
    expect(await getQuote("TEST-MINUTE")).toMatchObject({ source: "minute", asOf: "2026-09-23T03:00:00.000Z", date: "2026-09-23", last: 20 });
  });
  it("fallback daily ghi rõ ngày và nguồn, không giả realtime", async () => {
    vi.mocked(fetchMinuteBars).mockRejectedValue(new Error("offline"));
    vi.mocked(fetchDailyBars).mockResolvedValue([{ date: "2026-09-22", open: 20, high: 21, low: 19, close: 20, volume: 1 }]);
    expect(await getQuote("TEST-DAILY")).toMatchObject({ source: "daily", asOf: null, date: "2026-09-22" });
  });
});
