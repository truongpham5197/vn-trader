import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPassword } from "./admin-auth";

describe("checkPassword", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("ADMIN_PASSWORD ưu tiên, trả token hash (không lộ mật khẩu)", () => {
    vi.stubEnv("ADMIN_PASSWORD", "abc");
    vi.stubEnv("CRON_SECRET", "cron");
    const t = checkPassword("abc");
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(t).not.toContain("abc");
    expect(checkPassword("cron")).toBeNull();
  });

  it("fallback CRON_SECRET; sai/rỗng → null", () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    vi.stubEnv("CRON_SECRET", "cron");
    expect(checkPassword("cron")).not.toBeNull();
    expect(checkPassword("cro")).toBeNull();
    expect(checkPassword("")).toBeNull();
  });

  it("không cấu hình mật khẩu → không cho đăng nhập bằng chuỗi rỗng", () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    vi.stubEnv("CRON_SECRET", "");
    expect(checkPassword("")).toBeNull();
  });
});
