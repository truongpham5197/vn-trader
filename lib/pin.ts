import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** Mã PIN hợp lệ: đúng 6 chữ số. */
export const validPin = (v: unknown): v is string => typeof v === "string" && /^\d{6}$/.test(v);

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

export function checkPin(pin: string, stored: string | null | undefined): boolean {
  const [salt, hash] = (stored ?? "").split(":");
  if (!salt || !hash) return false;
  const want = Buffer.from(hash, "hex");
  const got = scryptSync(pin, Buffer.from(salt, "hex"), want.length);
  return want.length > 0 && timingSafeEqual(want, got);
}

const mac = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

/** Cookie phiên `id.ver.sig` — không sửa tay được id; ver khớp User.sessionVer (đổi PIN → thiết bị cũ phải nhập lại). */
export const signSession = (id: number, ver: number, secret: string) => `${id}.${ver}.${mac(`${id}.${ver}`, secret)}`;

export function readSession(v: string | undefined, secret: string): { id: number; ver: number } | null {
  const m = /^(\d+)\.(\d+)\.([\w-]+)$/.exec(v ?? "");
  if (!m) return null;
  const want = Buffer.from(mac(`${m[1]}.${m[2]}`, secret));
  const got = Buffer.from(m[3]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const id = Number(m[1]);
  return id > 0 ? { id, ver: Number(m[2]) } : null;
}

/** Sai quá 5 lần → khóa 15 phút. */
export const PIN_MAX_FAILS = 5;
export const PIN_LOCK_MS = 15 * 60_000;
