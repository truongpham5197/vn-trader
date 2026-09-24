import { prisma } from "../prisma";
import { VN30 } from "../data/vn30";
import { atr, highestHighBefore, rsi, sma } from "../strategy/indicators";
import { floorTick, buyZoneAboveStop } from "../strategy/breakout20";
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
  confirmed?: false; // bảng quan sát không thay thế Signal từ scanner
  dataDate?: string;
  trigger?: string;
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
  if (!ma20 || !ma50 || !a14 || r14 === null || !hh || !volAvg) return null;

  const chgPct = (last.close / prev.close - 1) * 100;
  const volX = last.volume / volAvg;
  const distHighPct = ((hh - last.close) / hh) * 100;
  const uptrend = last.close > ma50;
  const ret5 = n > 5 ? (last.close / closes[n - 6] - 1) * 100 : null;
  const ret20 = n > 20 ? (last.close / closes[n - 21] - 1) * 100 : null;
  const perf = [ret5 !== null && `1 tuần ${sg(ret5)}`, ret20 !== null && `1 tháng ${sg(ret20)}`].filter(Boolean).join(", ");
  const trendFact = uptrend
    ? `Giá ${dong(last.close)} trên trung bình 50 phiên (${dong(ma50)})${perf ? ` · ${perf}` : ""}`
    : `Giá ${dong(last.close)} dưới trung bình 50 phiên (${dong(ma50)})${perf ? ` · ${perf}` : ""}`;
  const volFact = `Khối lượng phiên gần nhất gấp ${volX.toFixed(1)}× trung bình 20 phiên${
    volX >= 1.5 ? " → giao dịch sôi động hơn, chưa kết luận tích lũy" : volX < 0.8 ? " → giao dịch thưa" : ""
  }`;
  const base: Omit<Vn30Row, "setup" | "score" | "note" | "plain" | "facts"> = {
    ticker,
    sector,
    close: last.close,
    chgPct,
    confirmed: false,
    dataDate: last.date,
    trigger: "Chờ scanner xác nhận bằng nến đóng cửa và tham số chiến lược đang bật.",
  };

  // Breakout sắp nổ: giá áp sát đỉnh 20 phiên (≤3% dưới đỉnh)
  if (distHighPct >= 0 && distHighPct <= 3 && last.close > ma20) {
    const entry = hh;
    const stop = floorTick(entry - 2 * a14);
    return {
      ...base,
      setup: "🔥 Sắp vượt đỉnh",
      score: 80 + Math.min(volX * 5, 15) - distHighPct * 3,
      buyZone: buyZoneAboveStop(floorTick(hh * 0.99), floorTick(hh * 1.01), stop),
      stop,
      target: floorTick(entry + 2 * (entry - stop)),
      note: `cách đỉnh ${hh.toFixed(2)} chỉ ${distHighPct.toFixed(1)}% · vol ${volX.toFixed(1)}x · vượt đỉnh kèm vol = trigger`,
      plain: "Giá gần đỉnh 20 phiên — mới là setup theo dõi, chưa xác nhận vượt đỉnh.",
      trigger: `Chờ đóng cửa vượt ${dong(hh)} với khối lượng đạt ngưỡng chiến lược; không mua chỉ vì ở gần đỉnh.`,
      facts: [
        `Giá chỉ thấp hơn đỉnh 20 phiên (${dong(hh)}) ${distHighPct.toFixed(1)}% — sắp thử vượt đỉnh`,
        trendFact,
        `${volFact} — cần xác nhận bằng giá đóng cửa, khối lượng không tự chứng minh lực mua`,
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
      setup: "↩️ Về đường trung bình",
      score: 70 - distMa20 * 500,
      buyZone: buyZoneAboveStop(floorTick(ma20 * 0.98), floorTick(Math.min(last.close * 1.005, ma20 * 1.02)), stop),
      stop,
      target: floorTick(entry + 2 * (entry - stop)),
      note: `uptrend (close > MA50 ${ma50.toFixed(1)}) · đang về MA20 ${ma20.toFixed(2)} · RSI ${r14.toFixed(0)}`,
      plain: "Giá về gần MA20 và còn trên MA50 — theo dõi khả năng giữ hỗ trợ, chưa phải lệnh mua.",
      trigger: "Chờ nến đóng cửa giữ vùng hỗ trợ và khối lượng đạt điều kiện pullback của scanner.",
      facts: [
        trendFact,
        `Giá chỉ cách đường trung bình 20 phiên (${dong(ma20)}) ${(distMa20 * 100).toFixed(1)}% — vùng hỗ trợ hay gặp trong xu hướng tăng`,
        `${volFact} — chỉ mô tả hoạt động giao dịch, chưa xác nhận nhịp điều chỉnh lành mạnh`,
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
      setup: "💧 Giảm nhanh ngắn hạn",
      score: 60 - r2,
      buyZone: buyZoneAboveStop(floorTick(entry * 0.98), floorTick(entry), stop),
      stop,
      target: floorTick(entry + 1.5 * (entry - stop)),
      note: `RSI(2)=${r2.toFixed(1)} <10, giá trên MA50 — quan sát quá bán, chưa xác nhận`,
      plain: "Giảm nhanh ngắn hạn dù còn trên MA50. Quá bán không bảo đảm sẽ hồi; lưu ý hạn chế bán T+2.",
      trigger: "Chờ nến đóng cửa thỏa ngưỡng RSI2 và điều kiện xu hướng của scanner; vùng theo dõi dùng ngưỡng rộng hơn.",
      facts: [
        trendFact,
        `RSI(2) = ${r2.toFixed(1)} (dưới 10) — giảm nhanh ngắn hạn, không phải xác suất hồi`,
        volFact,
      ],
    };
  }

  // Uptrend nhưng đã chạy xa — chờ pullback
  if (last.close > ma20 && ma20 > ma50) {
    return {
      ...base,
      setup: "📈 Đang tăng, đừng đuổi",
      score: 40 + Math.min((last.close / ma50 - 1) * 40, 10),
      note: `trên MA20/MA50 — không đuổi, chờ pullback về ~${ma20.toFixed(1)}`,
      plain: "Đang tăng tốt nhưng đã lên xa — đừng mua đuổi, chờ giá chỉnh về",
      facts: [trendFact, `Giá cao hơn đường trung bình 20 phiên (${dong(ma20)}) ${((last.close / ma20 - 1) * 100).toFixed(1)}% — đã chạy xa điểm mua an toàn`],
    };
  }

  return {
    ...base,
    setup: "⏸ Chưa rõ hướng",
    score: 10,
    note: `dưới MA50 ${ma50.toFixed(1)} · RSI ${r14.toFixed(0)} — chưa có setup`,
    plain: "Xu hướng chưa tăng — chưa nên mua",
    facts: [trendFact, `RSI(14) = ${r14.toFixed(0)}`],
  };
}
