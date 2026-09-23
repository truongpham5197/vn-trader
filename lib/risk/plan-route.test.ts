import { describe, expect, it, vi } from "vitest";
import { getPersonalSignalPlan, type PersonalPlanDeps, type SignalForPlan } from "./personal";
import { NEED_USER, type AppUser } from "../user";

const alice: AppUser = { id: 2, username: "Alice", owner: false, navVnd: 500e6, riskPct: 0.01, watchlist: [] };
const signal: SignalForPlan = {
  id: 11,
  ticker: "FPT",
  sector: "Công nghệ",
  symbolId: 7,
  entry: 100,
  stop: 95,
  target: 110,
};

const deps = (): PersonalPlanDeps => ({
  findSignal: async (id) => (id === 11 ? signal : null),
  loadBook: async () => ({ nav: 500e6, cash: 500e6, riskPct: 0.01, holdings: [] }),
  getQuote: async () => ({ last: 101, ref: 99 }),
  avg20Value: async () => 50e9,
});

describe("plan route contract", () => {
  it("guest 401 trước khi đụng tín hiệu/sổ — không nhận userId client", async () => {
    const findSignal = vi.fn();
    const loadBook = vi.fn();
    const r = await getPersonalSignalPlan(null, 11, { entry: "100", userId: "1" }, {
      ...deps(),
      findSignal,
      loadBook,
    });
    expect(r.status).toBe(401);
    expect((r.body as { error: string }).error).toBe(NEED_USER);
    expect(findSignal).not.toHaveBeenCalled();
    expect(loadBook).not.toHaveBeenCalled();
  });

  it("cookie user thắng userId query", async () => {
    const loadBook = vi.fn(async (u: AppUser) => {
      expect(u.id).toBe(alice.id);
      return { nav: 500e6, cash: 500e6, riskPct: 0.01, holdings: [] };
    });
    const r = await getPersonalSignalPlan(alice, 11, { entry: "100", userId: "99" }, { ...deps(), loadBook });
    expect(r.status).toBe(200);
    expect(loadBook).toHaveBeenCalledTimes(1);
    expect((r.body as { qty: number }).qty).toBe(1000);
  });
});
