import { prisma } from "../prisma";
import { VN30 } from "../data/vn30";
import { atr, highestHighBefore, rsi, sma } from "../strategy/indicators";
import { floorTick } from "../strategy/breakout20";
import type { Bar } from "../data/types";

export interface Vn30Row {
  ticker: string;
  sector: string | null;
  close: number;
  chgPct: number | null;
  setup: string;
  score: number;
  buyZone?: [number, number];
  stop?: number;
  target?: number;
  note: string;
  plain: string; // giải thích không thuật ngữ cho người mới
  facts: string[]; // lý do cụ thể có số liệu — vì sao ra setup này
}

/**
 * Chấm điểm setup cho từng mã VN30 — gợi ý vùng mua/SL/TP ngay cả khi
 * chưa đủ điều kiện thành Signal (watchlist chủ động).
 */
export async function vn30Snapshot(): Promise<Vn30Row[]> {
  const symbols = await prisma.symbol.findMany({
    where: { active: true, ticker: { in: [...VN30] } },
    select: { id: true, ticker: true, sector: true },
  });
  const cutoff = new Date(Date.now() - 100 * 86400e3).toISOString().slice(0, 10);
  const rows = await prisma.dailyBar.findMany({
    where: { symbolId: { in: symbols.map((s) => s.id) }, date: { gte: cutoff } },
    orderBy: [{ symbolId: "asc" }, { date: "desc" }],
  });
  const bySymbol = new Map<number, typeof rows>();
  for (const r of rows) bySymbol.set(r.symbolId, [...(bySymbol.get(r.symbolId) ?? []), r]);

  const out: Vn30Row[] = [];
  for (const sym of symbols) {
    const desc = bySymbol.get(sym.id) ?? [];
    if (desc.length < 60) continue;
    const bars: Bar[] = desc
      .slice(0, 60)
      .reverse()
      .map((r) => ({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume }));
    const row = scoreSetup(sym.ticker, sym.sector, bars);
    if (row) out.push(row);
  }
  return out.sort((a, b) => b.score - a.score);
}

const dong = (p: number) => `${Math.round(p * 1000).toLocaleString("vi-VN")}đ`;
const sg = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

export function scoreSetup(ticker: string, sector: string | null, bars: Bar[]): Vn30Row | null {
  const n = bars.length;
  const last = bars[n - 1];
  const prev = bars[n - 2];
  const closes = bars.map((b) => b.close);
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const a14 = atr(bars, 14);
  const r14 = rsi(closes, 14);
  const r2 = rsi(closes, 2);
  const hh = highestHighBefore(bars, 20, n - 1);
  const volAvg = sma(bars.slice(0, n - 1).map((b) => b.volume), 20);
  if (!ma20 || !ma50 || !a14 || !r14 || !hh || !volAvg) return null;

  const chgPct = (last.close / prev.close - 1) * 100;
  const volX = last.volume / volAvg;
  const distHighPct = ((hh - last.close) / hh) * 100;
  const uptrend = last.close > ma50;
  const ret5 = n > 5 ? (last.close / closes[n - 6] - 1) * 100 : null;
  const ret20 = n > 20 ? (last.close / closes[n - 21] - 1) * 100 : null;
  const perf = [ret5 !== null && `1 tuần ${sg(ret5)}`, ret20 !== null && `1 tháng ${sg(ret20)}`].filter(Boolean).join(", ");
  const trendFact = uptrend
    ? `Xu hướng tăng: giá ${dong(last.close)} trên đường trung bình 50 phiên (${dong(ma50)})${perf ? ` · ${perf}` : ""}`
    : `Giá ${dong(last.close)} dưới đường trung bình 50 phiên (${dong(ma50)}) — xu hướng dài chưa tăng${perf ? ` · ${perf}` : ""}`;
  const volFact = `Khối lượng phiên gần nhất gấp ${volX.toFixed(1)}× trung bình 20 phiên${
    volX >= 1.5 ? " → nhiều người mua vào" : volX < 0.8 ? " → giao dịch thưa" : ""
  }`;
  const base: Omit<Vn30Row, "setup" | "score" | "note" | "plain" | "facts"> = {
    ticker,
    sector,
    close: last.close,
    chgPct,
  };

  // Breakout sắp nổ: giá áp sát đỉnh 20 phiên (≤3% dưới đỉnh)
  if (distHighPct >= 0 && distHighPct <= 3 && last.close > ma20) {
    const entry = hh;
    const stop = floorTick(entry - 2 * a14);
    return {
      ...base,
      setup: "🔥 breakout gần",
      score: 80 + Math.min(volX * 5, 15) - distHighPct * 3,
      buyZone: [floorTick(hh * 0.99), floorTick(hh * 1.01)],
      stop,
      target: floorTick(entry + 2 * (entry - stop)),
      note: `cách đỉnh ${hh.toFixed(2)} chỉ ${distHighPct.toFixed(1)}% · vol ${volX.toFixed(1)}x · vượt đỉnh kèm vol = trigger`,
      plain: "Giá đang sát mức cao nhất 1 tháng — nếu vượt lên kèm nhiều người mua thì thường chạy tiếp",
      facts: [
        `Giá chỉ thấp hơn đỉnh 20 phiên (${dong(hh)}) ${distHighPct.toFixed(1)}% — sắp thử vượt đỉnh`,
        trendFact,
        volX >= 1.2 ? `${volFact} — lực mua đang tăng trước khi vượt đỉnh` : `${volFact} — cần khối lượng tăng khi vượt đỉnh mới đáng tin`,
      ],
    };
  }

  // Pullback về MA20 trong uptrend
  const distMa20 = Math.abs(last.close - ma20) / ma20;
  if (uptrend && distMa20 <= 0.02) {
    const entry = last.close;
    const stop = floorTick(entry - 1.5 * a14);
    return {
      ...base,
      setup: "↩️ pullback MA20",
      score: 70 - distMa20 * 500,
      buyZone: [floorTick(ma20 * 0.98), floorTick(Math.min(last.close * 1.005, ma20 * 1.02))],
      stop,
      target: floorTick(entry + 2 * (entry - stop)),
      note: `uptrend (close > MA50 ${ma50.toFixed(1)}) · đang về MA20 ${ma20.toFixed(2)} · RSI ${r14.toFixed(0)}`,
      plain: "Xu hướng đang tăng, giá vừa điều chỉnh về mức trung bình 1 tháng — mua được giá tốt hơn",
      facts: [
        trendFact,
        `Giá chỉ cách đường trung bình 20 phiên (${dong(ma20)}) ${(distMa20 * 100).toFixed(1)}% — vùng hỗ trợ hay gặp trong xu hướng tăng`,
        volX < 1 ? `${volFact} — điều chỉnh với ít người bán, lành mạnh` : `${volFact} — bán ra khá mạnh, nên chờ thêm 1–2 phiên`,
        `RSI(14) = ${r14.toFixed(0)} — ${r14 < 45 ? "đã hạ nhiệt" : r14 > 70 ? "vẫn còn nóng" : "trung tính"}`,
      ],
    };
  }

  // Quá bán ngắn hạn trong uptrend (RSI2 < 10)
  if (uptrend && r2 !== null && r2 < 10) {
    const entry = last.close;
    const stop = floorTick(entry * 0.96);
    return {
      ...base,
      setup: "💧 quá bán RSI2",
      score: 60 - r2,
      buyZone: [floorTick(entry * 0.98), floorTick(entry)],
      stop,
      target: floorTick(entry + 1.5 * (entry - stop)),
      note: `RSI(2)=${r2.toFixed(1)} <10 trong uptrend — kỳ vọng hồi kỹ thuật 1–5 phiên`,
      plain: "Giảm mạnh vài phiên gần đây dù xu hướng lớn vẫn tăng — thường hồi lại trong 1 tuần",
      facts: [
        trendFact,
        `RSI(2) = ${r2.toFixed(1)} (dưới 10) — giảm quá nhanh trong vài phiên, hay có nhịp hồi`,
        volFact,
      ],
    };
  }

  // Uptrend nhưng đã chạy xa — chờ pullback
  if (last.close > ma20 && ma20 > ma50) {
    return {
      ...base,
      setup: "📈 uptrend",
      score: 40 + Math.min((last.close / ma50 - 1) * 40, 10),
      note: `trên MA20/MA50 — không đuổi, chờ pullback về ~${ma20.toFixed(1)}`,
      plain: "Đang tăng tốt nhưng đã lên xa — đừng mua đuổi, chờ giá chỉnh về",
      facts: [trendFact, `Giá cao hơn đường trung bình 20 phiên (${dong(ma20)}) ${((last.close / ma20 - 1) * 100).toFixed(1)}% — đã chạy xa điểm mua an toàn`],
    };
  }

  return {
    ...base,
    setup: "⏸ theo dõi",
    score: 10,
    note: `dưới MA50 ${ma50.toFixed(1)} · RSI ${r14.toFixed(0)} — chưa có setup`,
    plain: "Xu hướng chưa tăng — chưa nên mua",
    facts: [trendFact, `RSI(14) = ${r14.toFixed(0)}`],
  };
}
