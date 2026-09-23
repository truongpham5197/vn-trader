import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../prisma", () => ({ prisma: { trade: { findMany: vi.fn() }, signal: { findMany: vi.fn(), findFirst: vi.fn() } } }));
vi.mock("../user", () => ({ ownerId: async () => 1 }));
vi.mock("../signals", () => ({ latestSignalDate: async () => "2026-09-22" }));
vi.mock("../price", () => ({ getQuote: vi.fn() }));
vi.mock("../analysis/vn30", () => ({ vn30Snapshot: vi.fn() }));
import { prisma } from "../prisma";
import { getQuote } from "../price";
import { vn30Snapshot } from "../analysis/vn30";
import { collectTopPicks } from "./top-picks";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-23T03:00:00Z"));
  vi.mocked(prisma.trade.findMany).mockResolvedValue([]);
  vi.mocked(prisma.signal.findFirst).mockResolvedValue({ date: "2026-09-22" } as never);
  vi.mocked(vn30Snapshot).mockResolvedValue([]);
});
const signal = (id: number) => ({ id, date: "2026-09-22", symbol: { ticker: `T${id}`, sector: "Test" }, strategy: { name: "breakout-20" }, entry: 20, stop: 19, target: 23, buyLow: 19.8, buyHigh: 20.2, rr: 3, qty: 100, reason: "test", plan: null });
const quote = (last: number) => ({ last, ref: 20, open: 20, high: 21, low: 19.8, source: "minute" as const, asOf: "2026-09-23T02:59:00Z", date: "2026-09-23" });
describe("collectTopPicks gates", () => {
  it("không bù watchlist khi không có tín hiệu hợp lệ", async () => {
    vi.mocked(prisma.signal.findMany).mockResolvedValue([]);
    expect((await collectTopPicks()).picks).toEqual([]);
    expect(vn30Snapshot).not.toHaveBeenCalled();
  });
  it("đánh giá cả ứng viên sau số 10, loại mua đuổi và giá dưới stop", async () => {
    vi.mocked(prisma.signal.findMany).mockResolvedValue(Array.from({ length: 12 }, (_, i) => signal(i)) as never);
    vi.mocked(getQuote).mockImplementation(async (t) => quote(t === "T11" ? 20 : t === "T0" ? 19 : 22));
    const r = await collectTopPicks();
    expect(r.picks.map((p) => p.ticker)).toEqual(["T11"]);
    expect(r.picks[0].qty).toBeNull(); // không phát số lượng của owner cho mọi người
  });
  it("giá fallback daily không được gọi là cơ hội trong phiên", async () => {
    vi.mocked(prisma.signal.findMany).mockResolvedValue([signal(1)] as never);
    vi.mocked(getQuote).mockResolvedValue({ ...quote(20), source: "daily", asOf: null });
    expect((await collectTopPicks()).picks).toEqual([]);
  });
});
