import { describe, expect, it } from "vitest";
import { navActive, navigationAfterSessionChange } from "./nav";

const hrefs = ["/", "/signals", "/signals/evidence", "/journal", "/backtest"];

describe("navActive", () => {
  it("trang bằng chứng không sáng tab tín hiệu", () => {
    expect(navActive("/signals/evidence", "/signals", hrefs)).toBe(false);
    expect(navActive("/signals/evidence", "/signals/evidence", hrefs)).toBe(true);
  });

  it("trang tín hiệu chỉ sáng tab tín hiệu", () => {
    expect(navActive("/signals", "/signals", hrefs)).toBe(true);
    expect(navActive("/signals", "/signals/evidence", hrefs)).toBe(false);
    expect(navActive("/signals?date=all", "/signals", hrefs)).toBe(false);
  });

  it("trang chủ không sáng mọi tab", () => {
    expect(navActive("/", "/", hrefs)).toBe(true);
    expect(navActive("/", "/signals", hrefs)).toBe(false);
  });
});

describe("đổi phiên", () => {
  it("không soft-refresh — bấm tab sau đó sẽ chồng trang", () => {
    expect(navigationAfterSessionChange()).toBe("reload");
  });
});
