import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("../prisma", () => ({ prisma: { signal: { findMany: vi.fn(), updateMany: vi.fn() } } }));
vi.mock("../settings", () => ({ getBool: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn() }));
vi.mock("../signals", () => ({ latestSignalDate: async () => "2026-09-22" }));
vi.mock("../price", () => ({ getQuote: vi.fn() }));
vi.mock("../telegram/notify", () => ({ esc: (s: string) => s.replaceAll("<", "&lt;"), sendTelegram: vi.fn() }));
import { prisma } from "../prisma";
import { getBool, getSetting } from "../settings";
import { getQuote } from "../price";
import { sendTelegram } from "../telegram/notify";
import { runSignalHealth } from "./signal-health";
const signal = { id: 1, date: "2026-09-22", entry: 20, stop: 19, target: 23, buyLow: 19.8, buyHigh: 20.2, symbol: { ticker: "TEST" }, strategy: { name: "breakout-20" } };
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-23T03:00:00Z"));
  vi.mocked(getBool).mockImplementation(async (k) => k === "scanEnabled");
  vi.mocked(getSetting).mockResolvedValue("");
  vi.mocked(prisma.signal.findMany).mockResolvedValue([signal] as never);
  vi.mocked(prisma.signal.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(sendTelegram).mockResolvedValue(true);
});
afterEach(() => vi.useRealTimers());
it("ghi hết hiệu lực khi thủng stop và báo một lần, không tự bán", async () => {
  vi.mocked(getQuote).mockResolvedValue({ last: 19, ref: 20, open: 20, high: 20, low: 19, source: "minute", asOf: "2026-09-23T02:59:00Z", date: "2026-09-23" });
  expect(await runSignalHealth()).toBe(1);
  expect(prisma.signal.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1, status: { in: ["new", "notified"] } }, data: { status: "expired" } }));
  expect(sendTelegram).toHaveBeenCalledWith(expect.stringContaining("Đã thủng cắt lỗ"), undefined, expect.objectContaining({ kind: "signal", userId: null }));
  vi.mocked(prisma.signal.updateMany).mockResolvedValue({ count: 0 });
  vi.mocked(sendTelegram).mockClear();
  expect(await runSignalHealth()).toBe(0);
  expect(sendTelegram).not.toHaveBeenCalled();
});
it("không hủy tín hiệu bằng giá cũ", async () => {
  vi.mocked(getQuote).mockResolvedValue({ last: 18, ref: null, open: null, high: null, low: null, source: "daily", date: "2026-09-22" });
  expect(await runSignalHealth()).toBe(0);
  expect(prisma.signal.updateMany).not.toHaveBeenCalled();
});
it("kill switch không bị bypass", async () => {
  vi.mocked(getBool).mockResolvedValue(true);
  expect(await runSignalHealth()).toBe(0);
  expect(prisma.signal.findMany).not.toHaveBeenCalled();
});
