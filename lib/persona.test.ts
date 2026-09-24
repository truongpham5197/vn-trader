import { describe, expect, it } from "vitest";
import { PERSONAS, personaById, pickPersona, say, variantOf, type Slot } from "./persona";

const SLOTS: Slot[] = ["greet", "buy", "held", "stop", "target", "exit", "up", "down", "win", "loss", "flat", "bye"];

describe("persona", () => {
  it("mỗi phong cách đủ mọi loại câu, id không trùng, không ký tự phá HTML", () => {
    expect(new Set(PERSONAS.map((p) => p.id)).size).toBe(PERSONAS.length);
    for (const p of PERSONAS) for (const s of SLOTS) {
      expect(p.lines[s].length, `${p.id}.${s}`).toBeGreaterThan(0);
      for (const l of p.lines[s]) expect(l).not.toMatch(/[<>&]/);
    }
  });

  it("câu thủng cắt lỗ khác nhau giữa các phong cách", () => {
    const first = PERSONAS.map((p) => say(p, "stop", { t: "FPT", n: "A" }));
    expect(new Set(first).size).toBe(PERSONAS.length);
  });

  it("không có câu nào ra lệnh bán hay hứa lãi", () => {
    const all = PERSONAS.flatMap((p) => SLOTS.flatMap((s) => p.lines[s])).join("\n").toLowerCase();
    expect(all).not.toMatch(/bán ngay|chắc chắn lãi|cam kết lãi|đảm bảo lãi|all in/);
  });

  it("say thay mã + tên, ổn định theo seed", () => {
    const p = personaById("genz");
    const a = say(p, "buy", { t: "HPG", n: "Linh" }, "2026-09-24");
    expect(a).toContain("HPG");
    expect(say(p, "buy", { t: "HPG", n: "Linh" }, "2026-09-24")).toBe(a);
    expect(personaById("khong-co").id).toBe(PERSONAS[0].id);
  });

  it("pickPersona trải đều phong cách mặc định", () => {
    const used: string[] = [];
    for (let i = 1; i <= PERSONAS.length; i++) used.push(pickPersona(used, i));
    expect(new Set(used).size).toBe(PERSONAS.length);
    expect(PERSONAS.map((p) => p.id)).toContain(pickPersona(used, 99));
  });

  it("cùng phong cách: mỗi biến thể có câu mở/chốt riêng tới 12 người", () => {
    for (const p of PERSONAS) {
      for (const slot of ["greet", "bye"] as const) {
        const xs = Array.from({ length: 12 }, (_, v) => say(p, slot, { n: "A" }, "2026-09-24", v));
        expect(new Set(xs).size, `${p.id}.${slot}`).toBe(12);
      }
      const stops = Array.from({ length: p.lines.stop.length }, (_, v) => say(p, "stop", { t: "FPT", n: "A" }, "d", v));
      expect(new Set(stops).size).toBe(p.lines.stop.length);
    }
  });

  it("variantOf: thứ tự theo id trong nhóm cùng phong cách, owner cũng tính", () => {
    const users = [{ id: 5, persona: "bep" }, { id: 1, persona: "bep" }, { id: 3, persona: "dev" }, { id: 9, persona: "bep" }];
    expect(variantOf(users, 1, "bep")).toBe(0);
    expect(variantOf(users, 5, "bep")).toBe(1);
    expect(variantOf(users, 9, "bep")).toBe(2);
    expect(variantOf(users, 3, "dev")).toBe(0);
  });
});
