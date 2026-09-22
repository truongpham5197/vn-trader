import { prisma } from "../prisma";
import { getNum } from "../settings";
import { sma } from "../strategy/indicators";
import { scoreSetup, type Vn30Row } from "./vn30";
import type { Bar } from "../data/types";
import { esc } from "../telegram/notify";
import { fetchDailyBars } from "../data/dnse";
import { sessionElapsed, vnToday } from "../vn-time";

const BARS = 60;

export interface StockInput {
  ticker: string;
  sector: string;
  companyName: string | null;
  bars: Bar[]; // ascending, đủ ≥ 60
  value: number[]; // GTGD VND từng phiên, cùng index với bars
}

export interface SectorPick extends Vn30Row {
  companyName: string | null;
  buyZone: [number, number];
  stop: number;
  target: number;
  upsidePct: number; // target so với giữa vùng mua
  riskPct: number; // stop so với giữa vùng mua
}

export type SectorTrend = "lead" | "strong" | "neutral" | "weak";

export interface SectorStat {
  sector: string;
  count: number;
  ret5: number; // % trung vị 1 tuần
  ret20: number; // % trung vị 1 tháng
  breadth: number; // % mã trên MA50
  flow: number; // GTGD TB 5 phiên / TB 20 phiên trước đó
  share: number; // % GTGD toàn thị trường (5 phiên gần nhất)
  score: number; // 0–100
  trend: SectorTrend;
  lowConfidence: boolean; // < 3 mã
  picks: SectorPick[]; // setup có vùng mua, tốt nhất trước
}

export interface SectorStrength {
  date: string | null;
  market: { count: number; ret5: number; ret20: number; breadth: number; flow: number };
  sectors: SectorStat[];
  topPicks: (SectorPick & { sectorTrend: SectorTrend })[];
  live?: { at: string; updated: number }; // có khi đã ghép giá trong phiên
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (a: number, b: number) => (a / b - 1) * 100;
const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);

/** Percentile rank 0–1 của v trong xs (ties lấy trung bình; v ngoài pool bị kẹp về [0,1]). */
const rankOf = (xs: number[], v: number) => {
  if (xs.length <= 1) return 0.5;
  const eq = xs.filter((x) => x === v).length;
  const r = (xs.filter((x) => x < v).length + Math.max(eq - 1, 0) / 2) / (xs.length - 1);
  return Math.min(Math.max(r, 0), 1);
};

/**
 * Xếp hạng nhóm ngành theo 4 thước đo dễ hiểu: tăng giá 1 tháng, 1 tuần,
 * độ rộng (% mã còn xu hướng tăng) và dòng tiền (GTGD tăng so với trước).
 * Pure — dữ liệu truyền vào, test được.
 */
export function computeSectorStrength(stocks: StockInput[]): SectorStrength {
  type M = { s: StockInput; ret5: number; ret20: number; aboveMa50: boolean; v5: number; v20: number };
  const metrics: M[] = [];
  for (const s of stocks) {
    const n = s.bars.length;
    if (n < BARS) continue;
    const closes = s.bars.map((b) => b.close);
    const ma50 = sma(closes, 50);
    if (ma50 === null) continue;
    metrics.push({
      s,
      ret5: pct(closes[n - 1], closes[n - 6]),
      ret20: pct(closes[n - 1], closes[n - 21]),
      aboveMa50: closes[n - 1] > ma50,
      v5: sum(s.value.slice(n - 5)) / 5,
      v20: sum(s.value.slice(n - 25, n - 5)) / 20,
    });
  }

  const totalV5 = sum(metrics.map((m) => m.v5)) || 1;
  const market = {
    count: metrics.length,
    ret5: median(metrics.map((m) => m.ret5)),
    ret20: median(metrics.map((m) => m.ret20)),
    breadth: metrics.length ? (metrics.filter((m) => m.aboveMa50).length / metrics.length) * 100 : 0,
    flow: sum(metrics.map((m) => m.v5)) / (sum(metrics.map((m) => m.v20)) || 1),
  };

  const bySector = new Map<string, M[]>();
  for (const m of metrics) bySector.set(m.s.sector, [...(bySector.get(m.s.sector) ?? []), m]);

  const sectors: SectorStat[] = [...bySector.entries()].map(([sector, ms]) => {
    const picks: SectorPick[] = ms
      .map((m): SectorPick | null => {
        const r = scoreSetup(m.s.ticker, sector, m.s.bars.slice(-BARS));
        if (!r?.buyZone || r.stop === undefined || r.target === undefined) return null;
        const mid = (r.buyZone[0] + r.buyZone[1]) / 2;
        return {
          ...r,
          buyZone: r.buyZone,
          stop: r.stop,
          target: r.target,
          companyName: m.s.companyName,
          upsidePct: pct(r.target, mid),
          riskPct: -pct(r.stop, mid),
        };
      })
      .filter((p): p is SectorPick => p !== null)
      .sort((a, b) => b.score - a.score);
    return {
      sector,
      count: ms.length,
      ret5: median(ms.map((m) => m.ret5)),
      ret20: median(ms.map((m) => m.ret20)),
      breadth: (ms.filter((m) => m.aboveMa50).length / ms.length) * 100,
      flow: sum(ms.map((m) => m.v5)) / (sum(ms.map((m) => m.v20)) || 1),
      share: (sum(ms.map((m) => m.v5)) / totalV5) * 100,
      score: 0,
      trend: "neutral",
      lowConfidence: ms.length < 3,
      picks,
    };
  });

  // Điểm = trọng số percentile giữa các ngành đủ mã; ngành ít mã chấm theo cùng thang
  const ranked = sectors.filter((s) => !s.lowConfidence);
  const pool = ranked.length ? ranked : sectors;
  const col = (k: "ret20" | "ret5" | "breadth" | "flow") => pool.map((s) => s[k]);
  for (const s of sectors) {
    s.score =
      100 *
      (0.35 * rankOf(col("ret20"), s.ret20) +
        0.2 * rankOf(col("ret5"), s.ret5) +
        0.25 * rankOf(col("breadth"), s.breadth) +
        0.2 * rankOf(col("flow"), s.flow));
  }
  const order = (a: SectorStat, b: SectorStat) =>
    Number(a.lowConfidence) - Number(b.lowConfidence) || b.score - a.score;
  sectors.sort(order);

  sectors.forEach((s, i) => {
    const up = s.ret20 > market.ret20 && s.breadth >= 50;
    s.trend = s.lowConfidence
      ? s.score >= 60 && up ? "strong" : s.score < 35 ? "weak" : "neutral"
      : i < 3 && up && s.score >= 60
        ? "lead"
        : s.score >= 60 && s.ret20 > 0
          ? "strong"
          : s.score < 35 || s.breadth < 30
            ? "weak"
            : "neutral";
  });

  // Top đáng chú ý: setup tốt nhất thuộc ngành dẫn đầu/mạnh trước
  const trendBonus: Record<SectorTrend, number> = { lead: 30, strong: 15, neutral: 0, weak: -30 };
  // Ngành < 3 mã không được cộng điểm — 1 mã tăng mạnh không phải xu hướng ngành
  const topPicks = sectors
    .filter((s) => s.trend !== "weak")
    .flatMap((s) =>
      s.picks.map((p) => ({ p: { ...p, sectorTrend: s.trend }, rank: p.score + (s.lowConfidence ? 0 : trendBonus[s.trend]) })),
    )
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 5)
    .map((x) => x.p);

  const date = metrics.reduce<string | null>((d, m) => {
    const last = m.s.bars[m.s.bars.length - 1].date;
    return !d || last > d ? last : d;
  }, null);
  return { date, market, sectors, topPicks };
}

/**
 * Ghép nến hôm nay (đang hình thành, DNSE) vào cuối chuỗi bars từ DB.
 * GTGD hôm nay quy đổi ra cả phiên theo thời gian đã trôi qua để so dòng
 * tiền công bằng với các phiên đủ. Mã fetch lỗi giữ nguyên data DB.
 */
async function mergeIntraday(stocks: StockInput[]): Promise<number> {
  const today = vnToday();
  const from = new Date(Date.now() - 5 * 86400e3);
  const scale = 1 / sessionElapsed();
  let updated = 0;
  let i = 0;
  const worker = async () => {
    while (i < stocks.length) {
      const s = stocks[i++];
      const bar = await fetchDailyBars(s.ticker, from, new Date()).then((bs) => bs.at(-1), () => undefined);
      if (bar?.date !== today) continue;
      if (s.bars.at(-1)?.date === today) {
        s.bars.pop();
        s.value.pop();
      }
      s.bars.push(bar);
      s.value.push(bar.close * bar.volume * 1000 * scale);
      updated++;
    }
  };
  await Promise.all(Array.from({ length: 16 }, worker));
  return updated;
}

/**
 * Load mã thanh khoản (GTGD TB 20 phiên ≥ ngưỡng) + 60 bars gần nhất → xếp hạng ngành.
 * `live` = ghép thêm giá đang khớp trong phiên (DNSE) — dùng khi thị trường mở.
 */
export async function loadSectorStrength(opts: { live?: boolean } = {}): Promise<SectorStrength> {
  const minValue = await getNum("universeMinValueVnd");
  const cut30 = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10);
  const liquid = (
    await prisma.dailyBar.groupBy({
      by: ["symbolId"],
      where: { date: { gte: cut30 } },
      _avg: { value: true },
    })
  )
    .filter((g) => (g._avg.value ?? 0) >= minValue)
    .map((g) => g.symbolId);

  const cut100 = new Date(Date.now() - 100 * 86400e3).toISOString().slice(0, 10);
  const [symbols, rows] = await Promise.all([
    prisma.symbol.findMany({
      where: { id: { in: liquid }, active: true, sector: { not: null } },
      select: { id: true, ticker: true, sector: true, companyName: true },
    }),
    prisma.dailyBar.findMany({
      where: { symbolId: { in: liquid }, date: { gte: cut100 } },
      orderBy: [{ symbolId: "asc" }, { date: "asc" }],
      select: { symbolId: true, date: true, open: true, high: true, low: true, close: true, volume: true, value: true },
    }),
  ]);
  const bySym = new Map<number, typeof rows>();
  for (const r of rows) {
    const arr = bySym.get(r.symbolId);
    if (arr) arr.push(r);
    else bySym.set(r.symbolId, [r]);
  }
  const stocks = symbols.map((s): StockInput => {
    const rs = bySym.get(s.id) ?? [];
    return {
      ticker: s.ticker,
      sector: s.sector!,
      companyName: s.companyName,
      bars: rs.map(({ date, open, high, low, close, volume }) => ({ date, open, high, low, close, volume })),
      value: rs.map((r) => r.value),
    };
  });
  if (!opts.live) return computeSectorStrength(stocks);
  const updated = await mergeIntraday(stocks);
  return { ...computeSectorStrength(stocks), live: { at: new Date().toISOString(), updated } };
}

export const liveTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });

const TREND_TG: Record<SectorTrend, string> = { lead: "🚀", strong: "📈", neutral: "➖", weak: "📉" };
const dong = (p: number) => `${Math.round(p * 1000).toLocaleString("vi-VN")}đ`;
const sg = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

/** Tin Telegram /nganh — parse_mode HTML, tên ngành có "&" nên phải esc. */
export function formatSectorStrength(r: SectorStrength): string {
  if (!r.sectors.length) return "Chưa đủ dữ liệu để xếp hạng ngành.";
  const m = r.market;
  const verdict =
    m.breadth >= 60 ? "thuận lợi" : m.breadth >= 40 ? "giằng co — chỉ mua ở ngành mạnh" : "yếu — nên đứng ngoài";
  const top = r.sectors.filter((s) => !s.lowConfidence).slice(0, 5);
  const weak = r.sectors.filter((s) => !s.lowConfidence && s.trend === "weak").map((s) => esc(s.sector));
  return [
    `🏆 <b>NHÓM NGÀNH</b> · ${r.live ? `⚡ trong phiên ${liveTime(r.live.at)}` : (r.date ?? "")}`,
    `Thị trường ${verdict} · ${m.breadth.toFixed(0)}% mã đang tăng · 1 tháng ${sg(m.ret20)}`,
    ``,
    ...top.map(
      (s, i) =>
        `${i + 1}. ${TREND_TG[s.trend]} <b>${esc(s.sector)}</b> — 1 tháng ${sg(s.ret20)} · ${s.breadth.toFixed(0)}% mã tăng · tiền ×${s.flow.toFixed(1)}` +
        (s.picks.length ? `\n    gợi ý: ${s.picks.slice(0, 3).map((p) => p.ticker).join(", ")}` : ""),
    ),
    ...(weak.length ? [``, `📉 Nên tránh: ${weak.join(", ")}`] : []),
    ...(r.topPicks.length
      ? [
          ``,
          `⭐ <b>Mã đáng chú ý</b>`,
          ...r.topPicks.map(
            (p) =>
              `<b>${p.ticker}</b> (${esc(p.sector ?? "")}) — mua ${dong(p.buyZone[0])}–${dong(p.buyZone[1])}\n` +
              `    cắt lỗ ${dong(p.stop)} (−${p.riskPct.toFixed(1)}%) · chốt lời ${dong(p.target)} (+${p.upsidePct.toFixed(1)}%)\n` +
              `    <i>${esc(p.plain)}</i>`,
          ),
        ]
      : []),
    ``,
    `<i>Gợi ý kỹ thuật tự động, chưa chứng minh có lãi — tập bằng tiền ảo trước.</i>`,
  ].join("\n");
}
