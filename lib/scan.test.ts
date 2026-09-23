import { beforeEach, describe, expect, it, vi } from "vitest";
import { requiredHistory } from "./scan-history";

const mocks = vi.hoisted(() => {
  const alwaysFn = vi.fn();
  const pullbackFn = vi.fn();
  return {
    today: "2026-09-22",
    inSession: false,
    alwaysFn,
    pullbackFn,
    prisma: {
      trade: { findMany: vi.fn() },
      symbol: { findMany: vi.fn() },
      dailyBar: { findMany: vi.fn() },
      signal: { upsert: vi.fn(), update: vi.fn() },
    },
    getBool: vi.fn(),
    getNum: vi.fn(),
    getSetting: vi.fn(),
    setSetting: vi.fn(),
    loadPortfolio: vi.fn(),
    notifySignal: vi.fn(),
    allWatchlists: vi.fn(),
    fetchFundamentals: vi.fn(),
    formatFundamentalsTg: vi.fn(),
    ensureStrategies: vi.fn(),
  };
});

vi.mock("./prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./settings", () => ({
  getBool: mocks.getBool,
  getNum: mocks.getNum,
  getSetting: mocks.getSetting,
  setSetting: mocks.setSetting,
}));
vi.mock("./report/portfolio", () => ({ loadPortfolio: mocks.loadPortfolio }));
vi.mock("./telegram/notify", () => ({ notifySignal: mocks.notifySignal }));
vi.mock("./trades", () => ({ allWatchlists: mocks.allWatchlists }));
vi.mock("./data/fundamentals", () => ({
  fetchFundamentals: mocks.fetchFundamentals,
  formatFundamentalsTg: mocks.formatFundamentalsTg,
}));
vi.mock("./vn-time", () => ({
  vnToday: () => mocks.today,
  inVnSession: () => mocks.inSession,
}));
vi.mock("./strategy", () => ({
  STRATEGIES: {
    "always-buy": {
      fn: mocks.alwaysFn,
      defaults: {},
      requiredBars: () => 5,
    },
    "pullback-ma20": {
      fn: mocks.pullbackFn,
      defaults: { maSlow: 50, atrPeriod: 14 },
      requiredBars: (p: Record<string, number>) => (p.maSlow ?? 50) + (p.atrPeriod ?? 14) + 2,
    },
  },
  ensureStrategies: mocks.ensureStrategies,
}));

import { runScan } from "./scan";

const CAND = {
  entry: 50,
  stop: 45,
  target: 60,
  rr: 2,
  reason: "x",
  plan: "Kỳ vọng 1 phiên",
  buyZone: [49, 51] as [number, number],
};

function datesBack(n: number, last: string): string[] {
  const d = new Date(`${last}T00:00:00Z`);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

function barRows(
  symbolId: number,
  n: number,
  last: string,
  value: number | ((iNewest: number) => number),
) {
  return datesBack(n, last).map((date, i) => ({
    id: symbolId * 1000 + i,
    symbolId,
    date,
    open: 50,
    high: 50,
    low: 50,
    close: 50,
    volume: 1_000_000,
    value: typeof value === "function" ? value(i) : value,
  }));
}

const SYM = { id: 1, ticker: "AAA", exchange: "HOSE", bandPct: 0.07, sector: "x" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.today = "2026-09-22";
  mocks.inSession = false;
  mocks.getBool.mockImplementation(async (k: string) => k !== "killSwitch");
  mocks.getNum.mockImplementation(async (k: string) => (k === "riskPct" ? 0.01 : 5e9));
  mocks.getSetting.mockImplementation(async (k: string) => (k === "universe" ? "liquid" : ""));
  mocks.setSetting.mockResolvedValue(undefined);
  mocks.loadPortfolio.mockResolvedValue({ nav: 500_000_000 });
  mocks.allWatchlists.mockResolvedValue([]);
  mocks.prisma.trade.findMany.mockResolvedValue([]);
  mocks.prisma.symbol.findMany.mockResolvedValue([SYM]);
  mocks.prisma.signal.upsert.mockImplementation(async ({ create }: { create: object }) => ({
    id: 1,
    status: "new",
    ...create,
    symbol: { ticker: "AAA" },
  }));
  mocks.alwaysFn.mockReturnValue(CAND);
  mocks.pullbackFn.mockReturnValue(null);
  mocks.ensureStrategies.mockResolvedValue([{ id: 1, name: "always", type: "always-buy", params: "{}" }]);
});

describe("runScan", () => {
  it("nạp cutoff theo max requiredBars (pullback 66), không cứng 100 ngày / 60 nến", async () => {
    mocks.ensureStrategies.mockResolvedValue([
      { id: 1, name: "pb", type: "pullback-ma20", params: "{}" },
      { id: 2, name: "always", type: "always-buy", params: "{}" },
    ]);
    mocks.prisma.dailyBar.findMany.mockResolvedValue(barRows(1, 70, "2026-09-22", 10e9));
    await runScan({ notify: false });
    const { cutoff } = requiredHistory(66);
    const old100 = new Date(Date.now() - 100 * 86400e3).toISOString().slice(0, 10);
    expect(cutoff < old100).toBe(true);
    expect(mocks.prisma.dailyBar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ date: { gte: cutoff } }) }),
    );
    expect(mocks.pullbackFn).toHaveBeenCalled();
    expect(mocks.pullbackFn.mock.calls[0][0].bars.length).toBeGreaterThanOrEqual(66);
  });

  it("thanh khoản dùng 20 nến mới — reverse không biến 20 nến già thành thanh khoản", async () => {
    mocks.prisma.dailyBar.findMany.mockResolvedValue(
      barRows(1, 66, "2026-09-22", (i) => (i < 20 ? 1e9 : 99e9)),
    );
    const r = await runScan({ notify: false });
    expect(r.signals).toBe(0);
    expect(mocks.prisma.signal.upsert).not.toHaveBeenCalled();
  });

  it("held/watchlist vẫn duyệt (filtered>0) nhưng không BUY nếu dưới minValue", async () => {
    mocks.prisma.trade.findMany.mockResolvedValue([{ symbol: { ticker: "AAA" } }]);
    mocks.prisma.dailyBar.findMany.mockResolvedValue(barRows(1, 20, "2026-09-22", 1e9));
    const r = await runScan({ notify: false });
    expect(r.scanned).toBe(1);
    expect(r.filtered).toBe(1);
    expect(r.signals).toBe(0);
  });

  it("held thiếu history không BUY, counts trung thực", async () => {
    mocks.prisma.trade.findMany.mockResolvedValue([{ symbol: { ticker: "AAA" } }]);
    mocks.prisma.dailyBar.findMany.mockResolvedValue(barRows(1, 2, "2026-09-22", 10e9));
    const r = await runScan({ notify: false });
    expect(r.signals).toBe(0);
    expect(r.filtered).toBe(1);
    expect(mocks.alwaysFn).not.toHaveBeenCalled();
  });

  it("mã last bar cũ hơn phiên hoàn tất của batch → loại, không BUY", async () => {
    mocks.prisma.symbol.findMany.mockResolvedValue([
      SYM,
      { id: 2, ticker: "BBB", exchange: "HOSE", bandPct: 0.07, sector: "x" },
    ]);
    mocks.prisma.dailyBar.findMany.mockResolvedValue([
      ...barRows(1, 20, "2026-09-18", 10e9),
      ...barRows(2, 20, "2026-09-22", 10e9),
    ]);
    const r = await runScan({ notify: false });
    expect(r.signals).toBe(1);
    const tickers = mocks.alwaysFn.mock.calls.map((c) => c[0].ticker);
    expect(tickers).toContain("BBB");
    expect(tickers).not.toContain("AAA");
  });

  it("trong phiên bỏ nến hôm nay chưa đóng — last bar là phiên hoàn tất", async () => {
    mocks.today = "2026-09-23";
    mocks.inSession = true;
    mocks.prisma.dailyBar.findMany.mockResolvedValue(barRows(1, 20, "2026-09-23", 10e9));
    await runScan({ notify: false });
    expect(mocks.alwaysFn).toHaveBeenCalled();
    expect(mocks.alwaysFn.mock.calls[0][0].bars.at(-1).date).toBe("2026-09-22");
  });

  it("ghi latestScanDate = phiên hoàn tất của batch kể cả 0 tín hiệu", async () => {
    mocks.alwaysFn.mockReturnValue(null);
    mocks.prisma.dailyBar.findMany.mockResolvedValue(barRows(1, 20, "2026-09-22", 10e9));
    const r = await runScan({ notify: false });
    expect(r.signals).toBe(0);
    expect(mocks.setSetting).toHaveBeenCalledWith("latestScanDate", "2026-09-22");
  });

  it("không ghi đè latestScanDate bằng ngày cũ hơn", async () => {
    mocks.getSetting.mockImplementation(async (k: string) =>
      k === "universe" ? "liquid" : k === "latestScanDate" ? "2026-09-22" : "",
    );
    mocks.prisma.dailyBar.findMany.mockResolvedValue(barRows(1, 20, "2026-09-21", 10e9));
    await runScan({ notify: false });
    expect(mocks.setSetting).not.toHaveBeenCalled();
  });

  it("kill-switch không ghi latestScanDate", async () => {
    mocks.getBool.mockResolvedValue(true);
    const r = await runScan({ notify: false });
    expect(r.skippedReason).toBe("kill-switch");
    expect(mocks.setSetting).not.toHaveBeenCalled();
  });

  it("trong phiên latestScanDate là nến đã đóng, không phải nến dở hôm nay", async () => {
    mocks.today = "2026-09-23";
    mocks.inSession = true;
    mocks.alwaysFn.mockReturnValue(null);
    mocks.prisma.dailyBar.findMany.mockResolvedValue(barRows(1, 20, "2026-09-23", 10e9));
    await runScan({ notify: false });
    expect(mocks.setSetting).toHaveBeenCalledWith("latestScanDate", "2026-09-22");
    expect(mocks.setSetting).not.toHaveBeenCalledWith("latestScanDate", "2026-09-23");
  });

  it("held đủ thanh khoản + history vẫn được BUY", async () => {
    mocks.prisma.trade.findMany.mockResolvedValue([{ symbol: { ticker: "AAA" } }]);
    mocks.allWatchlists.mockResolvedValue(["AAA"]);
    mocks.prisma.dailyBar.findMany.mockResolvedValue(barRows(1, 20, "2026-09-22", 10e9));
    const r = await runScan({ notify: false });
    expect(r.signals).toBe(1);
  });
});
