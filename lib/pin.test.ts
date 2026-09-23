import { describe, expect, it } from "vitest";
import { checkPin, hashPin, readSession, signSession, validPin } from "./pin";

describe("pin", () => {
  it("validPin chỉ nhận đúng 6 chữ số", () => {
    expect(validPin("012345")).toBe(true);
    for (const v of ["12345", "1234567", "12a456", 123456, null, " 123456"]) expect(validPin(v)).toBe(false);
  });

  it("hash + check", () => {
    const h = hashPin("246810");
    expect(h).not.toContain("246810");
    expect(checkPin("246810", h)).toBe(true);
    expect(checkPin("246811", h)).toBe(false);
    expect(checkPin("246810", null)).toBe(false);
    expect(hashPin("246810")).not.toBe(h);
  });

  it("cookie phiên có chữ ký", () => {
    const c = signSession(7, 2, "s3cret");
    expect(readSession(c, "s3cret")).toEqual({ id: 7, ver: 2 });
    expect(readSession(c, "other")).toBeNull();
    expect(readSession(c.replace(/^7\./, "1."), "s3cret")).toBeNull();
    expect(readSession("7", "s3cret")).toBeNull();
    expect(readSession(undefined, "s3cret")).toBeNull();
  });
});
