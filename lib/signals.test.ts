import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./prisma", () => ({ prisma: { setting: { findUnique: vi.fn() }, signal: { findFirst: vi.fn() } } }));
import { prisma } from "./prisma";
import { latestSignalDate } from "./signals";
beforeEach(() => { vi.clearAllMocks(); });
it("lượt quét mới không có signal không làm hồi sinh signal cũ", async () => {
  vi.mocked(prisma.setting.findUnique).mockResolvedValue({ key: "latestScanDate", value: "2026-09-23" });
  vi.mocked(prisma.signal.findFirst).mockResolvedValue({ date: "2026-09-21" } as never);
  expect(await latestSignalDate()).toBe("2026-09-23");
});
it("tương thích DB chưa có marker", async () => {
  vi.mocked(prisma.setting.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.signal.findFirst).mockResolvedValue({ date: "2026-09-21" } as never);
  expect(await latestSignalDate()).toBe("2026-09-21");
});
