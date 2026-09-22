import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cronAuthorized } from "./cron-auth";

/**
 * Đăng nhập web để sửa cấu hình. Mật khẩu = ADMIN_PASSWORD, không có thì dùng
 * CRON_SECRET. Không set cả hai → local dev mở (giống cronAuthorized).
 * Cookie chỉ chứa hash của mật khẩu — đổi mật khẩu là mọi phiên cũ tự hết hạn.
 */
export const ADMIN_COOKIE = "vt_admin";
const secret = () => process.env.ADMIN_PASSWORD || process.env.CRON_SECRET || "";
const token = (s: string) => createHash("sha256").update(`vn-trader-admin:${s}`).digest("hex");

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function checkPassword(pw: string): string | null {
  const s = secret();
  return s && same(pw, s) ? token(s) : null;
}

/** Dùng trong server component. */
export async function isAdmin(): Promise<boolean> {
  const s = secret();
  if (!s) return true;
  const c = (await cookies()).get(ADMIN_COOKIE)?.value;
  return Boolean(c && same(c, token(s)));
}

/** Dùng trong route handler — cookie web hoặc secret của cron. */
export async function adminAuthorized(req: Request): Promise<boolean> {
  return cronAuthorized(req) || isAdmin();
}
