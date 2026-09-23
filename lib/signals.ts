import { prisma } from "./prisma";

/**
 * Ngày nến của lượt scan gần nhất. Signal.date = phiên vừa đóng cửa (dùng cho
 * phiên kế tiếp) → lọc theo vnToday() luôn ra 0 cho tới khi scan chiều chạy.
 */
export async function latestSignalDate(): Promise<string | null> {
  return (await prisma.signal.findFirst({ orderBy: { date: "desc" }, select: { date: true } }))?.date ?? null;
}
