import { describe, expect, it } from "vitest";
import { navActive, navigationAfterSessionChange } from "./nav";

const hrefs = ["/", "/signals", "/gia-sau", "/journal", "/backtest"];

describe("navActive", () => {
  it("hai tab cạnh nhau không sáng cùng lúc", () => {
    expect(navActive("/gia-sau", "/signals", hrefs)).toBe(false);
    expect(navActive("/gia-sau", "/gia-sau", hrefs)).toBe(true);
    expect(navActive("/signals", "/gia-sau", hrefs)).toBe(false);
    expect(navActive("/signals", "/signals", hrefs)).toBe(true);
  });

  it("tab /gia-sau không sáng tab cha /signals", () => {
    const siblings = ["/", "/signals", "/gia-sau"];
    expect(navActive("/gia-sau", "/signals", siblings)).toBe(false);
    expect(navActive("/gia-sau", "/gia-sau", siblings)).toBe(true);
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
