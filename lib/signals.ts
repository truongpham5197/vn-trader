import { prisma } from "./prisma";

/**
 * Ngày nến của lượt scan gần nhất. Signal.date = phiên vừa đóng cửa (dùng cho
 * phiên kế tiếp) → lọc theo vnToday() luôn ra 0 cho tới khi scan chiều chạy.
 */
export async function latestSignalDate(): Promise<string | null> {
  const [scan, signal] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "latestScanDate" } }),
    prisma.signal.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
  ]);
  const date = scan?.value;
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) && (!signal || date >= signal.date) ? date : signal?.date ?? null;
}
