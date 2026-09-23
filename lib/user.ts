import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { getNum } from "./settings";

/** Không login — người dùng chọn username (cookie). Owner = chủ app: Telegram, TCBS, watcher. */
export const OWNER = "TruongMỡ";
export const USER_COOKIE = "vt_user";

export type AppUser = { id: number; username: string; owner: boolean; navVnd: number | null; riskPct: number | null; watchlist: string[] };

let ownerCache: number | undefined;

/** id của owner — tự tạo nếu chưa có (DB mới). */
export async function ownerId(): Promise<number> {
  if (ownerCache) return ownerCache;
  const u =
    (await prisma.user.findFirst({ where: { owner: true }, select: { id: true } })) ??
    (await prisma.user.upsert({ where: { username: OWNER }, update: { owner: true }, create: { username: OWNER, owner: true }, select: { id: true } }));
  return (ownerCache = u.id);
}

/** Người đang xem web (cookie) — null khi chưa chọn tên. */
export async function currentUser(): Promise<AppUser | null> {
  const id = Number((await cookies()).get(USER_COOKIE)?.value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return prisma.user.findUnique({ where: { id } });
}

/** Vốn + % rủi ro: owner dùng Setting chung (bot/scan), user khác lưu riêng, trống thì lấy mặc định. */
export async function userNum(u: Pick<AppUser, "owner" | "navVnd" | "riskPct"> | null, key: "navVnd" | "riskPct"): Promise<number> {
  return (!u?.owner && u?.[key]) || getNum(key);
}

/** Tên hợp lệ: 2–30 ký tự chữ (có dấu)/số/khoảng trắng/_.- */
export function cleanUsername(v: unknown): string | null {
  const s = String(v ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
  return /^[\p{L}\p{N}_.\- ]{2,30}$/u.test(s) ? s : null;
}

export const findByName = (username: string) =>
  prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } } });

/** Chưa chọn tên → id 0: danh sách trống, vốn/rủi ro mặc định. */
export const GUEST: AppUser = { id: 0, username: "", owner: false, navVnd: null, riskPct: null, watchlist: [] };

export const NEED_USER = "Chọn hoặc tạo tên người dùng ở góc trên trước";
export const ONLY_OWNER = `Chỉ ${OWNER} (chủ app) được đổi mục này`;
