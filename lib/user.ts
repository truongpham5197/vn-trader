import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { getNum } from "./settings";
import { readSession, signSession } from "./pin";

/** Chọn username + mã PIN 6 số (cookie có chữ ký, nhớ 1 năm). Owner = chủ app: Telegram, TCBS, watcher. */
export const OWNER = "TruongMỡ";
export const USER_COOKIE = "vt_user";

export type AppUser = { id: number; username: string; owner: boolean; navVnd: number | null; riskPct: number | null; watchlist: string[]; pushEnabled: boolean };

let ownerCache: number | undefined;

/** id của owner — tự tạo nếu chưa có (DB mới). */
export async function ownerId(): Promise<number> {
  if (ownerCache) return ownerCache;
  const u =
    (await prisma.user.findFirst({ where: { owner: true }, select: { id: true } })) ??
    (await prisma.user.upsert({ where: { username: OWNER }, update: { owner: true }, create: { username: OWNER, owner: true }, select: { id: true } }));
  return (ownerCache = u.id);
}

let secret: string | undefined;

/** Khóa ký cookie phiên — env SESSION_SECRET hoặc tự sinh lưu Setting "sessionSecret" (như vapidKeys). */
async function sessionSecret(): Promise<string> {
  if (secret) return secret;
  if (process.env.SESSION_SECRET) return (secret = process.env.SESSION_SECRET);
  await prisma.setting.createMany({ data: [{ key: "sessionSecret", value: randomBytes(32).toString("base64url") }], skipDuplicates: true });
  return (secret = (await prisma.setting.findUniqueOrThrow({ where: { key: "sessionSecret" } })).value);
}

export const sessionCookie = async (u: { id: number; sessionVer: number }) => signSession(u.id, u.sessionVer, await sessionSecret());

/** Người đang xem web (cookie đã ký + đúng sessionVer) — null khi chưa chọn tên / nhập PIN, cookie cũ không chữ ký. */
export async function currentUser(): Promise<AppUser | null> {
  const s = readSession((await cookies()).get(USER_COOKIE)?.value, await sessionSecret());
  if (!s) return null;
  const u = await prisma.user.findUnique({
    where: { id: s.id },
    select: { id: true, username: true, owner: true, navVnd: true, riskPct: true, watchlist: true, pushEnabled: true, sessionVer: true },
  });
  if (!u || u.sessionVer !== s.ver) return null;
  const { sessionVer: _, ...user } = u;
  return user;
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
export const GUEST: AppUser = { id: 0, username: "", owner: false, navVnd: null, riskPct: null, watchlist: [], pushEnabled: false };

export const NEED_USER = "Chọn tên người dùng ở góc trên và nhập mã PIN trước";
export const ONLY_OWNER = `Chỉ ${OWNER} (chủ app) được đổi mục này`;
