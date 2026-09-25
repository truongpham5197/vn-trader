import { describe, expect, it } from "vitest";
import { getPersonalSignalPlan, type PersonalPlanDeps, type SignalForPlan } from "./personal";
import { NEED_USER, type AppUser } from "../user";
import type { PlanResult } from "./plan";

const alice: AppUser = { id: 2, username: "Alice", owner: false, navVnd: 500e6, riskPct: 0.01, watchlist: [], pushEnabled: true };
const bob: AppUser = { id: 3, username: "Bob", owner: false, navVnd: 100e6, riskPct: 0.01, watchlist: [], pushEnabled: true };

const signal: SignalForPlan = {
  id: 11,
  ticker: "FPT",
  sector: "Công nghệ",
  symbolId: 7,
  entry: 100,
  stop: 95,
  target: 110,
};

const emptyBook = { nav: 500e6, cash: 500e6, riskPct: 0.01, holdings: [] };

function deps(over: Partial<PersonalPlanDeps> = {}): PersonalPlanDeps {
  return {
    findSignal: async (id) => (id === 11 ? signal : null),
    loadBook: async () => emptyBook,
    getQuote: async () => ({ last: 101, ref: 99 }),
    avg20Value: async () => 50e9,
    ...over,
  };
}

describe("getPersonalSignalPlan", () => {
  it("guest → 401, không đọc userId từ query", async () => {
    const r = await getPersonalSignalPlan(null, 11, { entry: "100", userId: 1 }, deps());
    expect(r.status).toBe(401);
    expect((r.body as { error: string }).error).toBe(NEED_USER);
  });

  it("tín hiệu không tồn tại → 404", async () => {
    const r = await getPersonalSignalPlan(alice, 99, {}, deps());
    expect(r.status).toBe(404);
  });

  it("entry query không dương / không hữu hạn → 400", async () => {
    for (const entry of ["0", "-1", "abc", "NaN", "Infinity"]) {
      const r = await getPersonalSignalPlan(alice, 11, { entry }, deps());
      expect(r.status, entry).toBe(400);
    }
  });

  it("không dùng qty của tín hiệu dùng chung", async () => {
    const r = await getPersonalSignalPlan(alice, 11, { entry: "100" }, deps());
    expect(r.status).toBe(200);
    const body = r.body as PlanResult & { qty: number };
    expect(body.qty).toBe(1000);
    expect(body.qty).not.toBe(99999);
  });

  it("hai user cùng tín hiệu → qty theo NAV/vị thế riêng", async () => {
    const d = deps({
      loadBook: async (u) =>
        u.id === alice.id
          ? emptyBook
          : { nav: 100e6, cash: 20e6, riskPct: 0.01, holdings: [] },
    });
    const a = await getPersonalSignalPlan(alice, 11, { entry: "100" }, d);
    const b = await getPersonalSignalPlan(bob, 11, { entry: "100" }, d);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const aq = (a.body as PlanResult).qty;
    const bq = (b.body as PlanResult).qty;
    expect(aq).toBe(1000);
    expect(bq).toBeGreaterThan(0);
    expect(bq).toBeLessThan(aq);
  });

  it("mặc định dùng giá khớp; không có last thì dùng tham chiếu + cảnh báo", async () => {
    const q = await getPersonalSignalPlan(alice, 11, {}, deps({ getQuote: async () => ({ last: 101, ref: 99 }) }));
    expect(q.status).toBe(200);
    expect((q.body as { entry: number; entrySource: string }).entry).toBe(101);
    expect((q.body as { entrySource: string }).entrySource).toBe("quote");

    const ref = await getPersonalSignalPlan(alice, 11, {}, deps({ getQuote: async () => ({ last: null, ref: 99 }) }));
    const body = ref.body as { entry: number; entrySource: string; warnings: string[] };
    expect(body.entry).toBe(99);
    expect(body.entrySource).toBe("ref");
    expect(body.warnings.join(" ")).toMatch(/tham chiếu/i);
    expect(body.warnings.join(" ")).toMatch(/thời gian|mốc/i);
  });

  it("entry query thắng giá khớp", async () => {
    const r = await getPersonalSignalPlan(alice, 11, { entry: "102.5" }, deps());
    expect((r.body as { entry: number; entrySource: string }).entry).toBe(102.5);
    expect((r.body as { entrySource: string }).entrySource).toBe("query");
  });

  it("thông tin tham khảo — không đặt lệnh", async () => {
    const r = await getPersonalSignalPlan(alice, 11, { entry: "100" }, deps());
    expect((r.body as { informational: boolean }).informational).toBe(true);
  });
});
