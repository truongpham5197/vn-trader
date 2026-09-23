import { fetchJson } from "./http";
import { esc } from "../telegram/notify";

const BASE = "https://api-finfo.vndirect.com.vn/v4";

// itemCode VNDirect: 21001 doanh thu thuần, 421701 tổng thu nhập HĐ (ngân hàng), 23000 LNST công ty mẹ
const REV = [421701, 21001];
const PROFIT = 23000;
const RATIO = { marketCap: "51003", pe: "51006", pb: "51012", divYield: "51033", roe: "52002" } as const;

export interface Quarter {
  period: string; // "Q2/2026"
  fiscalDate: string;
  revenue: number | null; // VND
  profit: number | null; // VND
}

export interface NewsItem {
  date: string;
  title: string;
  url: string | null;
  type: string;
}

export interface Fundamentals {
  ticker: string;
  isBank: boolean;
  pe: number | null;
  pb: number | null;
  roe: number | null; // tỷ lệ 0.24 = 24%
  divYield: number | null;
  marketCap: number | null;
  quarters: Quarter[]; // mới nhất trước
  news: NewsItem[];
}

export interface FundNote {
  tone: "good" | "bad" | "info";
  text: string;
}

const NEWS_TYPE: Record<string, string> = {
  investor_transaction: "GD cổ đông lớn/nội bộ",
  dividend: "Cổ tức",
  financialstatement: "BCTC",
  resolutions: "Nghị quyết",
  meeting: "ĐHCĐ",
  personnel: "Nhân sự",
  issue: "Phát hành",
};

const quarterLabel = (d: string) => `Q${Math.ceil(Number(d.slice(5, 7)) / 3)}/${d.slice(0, 4)}`;

/** Lấy chỉ số định giá + KQKD 8 quý + công bố thông tin 45 ngày từ VNDirect. Lỗi từng phần → null/rỗng. */
export async function fetchFundamentals(ticker: string, today = new Date()): Promise<Fundamentals> {
  const t = ticker.toUpperCase();
  const [ratios, stmts, news] = await Promise.all([
    fetchJson<{ data: { itemCode: string; value: number }[] }>(
      `${BASE}/ratios/latest?order=reportDate&where=code:${t}&filter=itemCode:${Object.values(RATIO).join(",")}&fields=itemCode,value`,
      1,
    ).catch(() => null),
    fetchJson<{ data: { itemCode: number; modelType: number; numericValue: number; fiscalDate: string }[] }>(
      `${BASE}/financial_statements?q=code:${t}~reportType:QUARTER~itemCode:${[...REV, PROFIT].join(",")}&sort=fiscalDate:desc&size=40`,
      1,
    ).catch(() => null),
    fetchJson<{ data: { newsDate: string; newsTitle: string; newsUrl?: string; dstockUrl?: string; newsType: string; newsGroup?: string }[] }>(
      `${BASE}/news?q=tagCodes:${t}&size=15&sort=newsDate:desc`,
      1,
    ).catch(() => null),
  ]);

  const r = (k: string) => ratios?.data.find((x) => x.itemCode === k)?.value ?? null;
  const byDate = new Map<string, Quarter>();
  let isBank = false;
  for (const x of stmts?.data ?? []) {
    const q = byDate.get(x.fiscalDate) ?? { period: quarterLabel(x.fiscalDate), fiscalDate: x.fiscalDate, revenue: null, profit: null };
    const code = Math.round(x.itemCode);
    if (code === PROFIT) q.profit = x.numericValue;
    else if (code === 421701) ((q.revenue = x.numericValue), (isBank = true));
    else if (code === 21001 && q.revenue === null) q.revenue = x.numericValue;
    byDate.set(x.fiscalDate, q);
  }
  const since = new Date(today.getTime() - 45 * 86400e3).toISOString().slice(0, 10);

  return {
    ticker: t,
    isBank,
    pe: r(RATIO.pe),
    pb: r(RATIO.pb),
    roe: r(RATIO.roe),
    divYield: r(RATIO.divYield),
    marketCap: r(RATIO.marketCap),
    quarters: [...byDate.values()].sort((a, b) => b.fiscalDate.localeCompare(a.fiscalDate)).slice(0, 8),
    news: (news?.data ?? [])
      .filter((n) => n.newsDate >= since)
      .slice(0, 6)
      .map((n) => ({ date: n.newsDate, title: n.newsTitle, url: n.newsUrl || n.dstockUrl || null, type: NEWS_TYPE[n.newsType] ?? (n.newsGroup?.includes("disclosure") ? "Công bố" : "Báo chí") })),
  };
}

const ty = (v: number) => `${Math.round(v / 1e9).toLocaleString("en-US")} tỷ`;
// nền thấp → % vô nghĩa (+940%) → "gấp 10.4 lần"
const pct = (v: number) => (v >= 2 ? `gấp ${(1 + v).toFixed(1)} lần` : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)}%`);
const growth = (a: number | null, b: number | null) => (a === null || b === null || b <= 0 ? null : (a - b) / b);
const toneOf = (g: number | null): FundNote["tone"] => (g === null ? "info" : g >= 0.1 ? "good" : g <= -0.1 ? "bad" : "info");

/** Diễn giải KQKD + định giá thành câu dễ hiểu (tone để tô màu / đánh giá tổng). */
export function summarizeFundamentals(f: Fundamentals, now = Date.now()): FundNote[] {
  const notes: FundNote[] = [];
  const [q0] = f.quarters;
  const q4 = q0 && f.quarters.find((q) => q.fiscalDate.slice(5) === q0.fiscalDate.slice(5) && +q.fiscalDate.slice(0, 4) === +q0.fiscalDate.slice(0, 4) - 1);

  if (q0?.profit != null) {
    const g = growth(q0.profit, q4?.profit ?? null);
    if (q0.profit < 0) notes.push({ tone: "bad", text: `${q0.period} LỖ ${ty(-q0.profit)}${q4?.profit != null ? ` (cùng kỳ ${q4.profit >= 0 ? "lãi" : "lỗ"} ${ty(Math.abs(q4.profit))})` : ""}` });
    else if (q4?.profit != null && q4.profit <= 0) notes.push({ tone: "good", text: `${q0.period} lãi ${ty(q0.profit)} — chuyển từ lỗ sang lãi so cùng kỳ` });
    else notes.push({ tone: toneOf(g), text: `Lợi nhuận ${q0.period}: ${ty(q0.profit)}${g !== null ? ` (${pct(g)} so cùng kỳ)` : ""}` });
  }
  if (q0?.revenue != null) {
    const g = growth(q0.revenue, q4?.revenue ?? null);
    notes.push({ tone: toneOf(g), text: `${f.isBank ? "Tổng thu nhập" : "Doanh thu"} ${q0.period}: ${ty(q0.revenue)}${g !== null ? ` (${pct(g)} so cùng kỳ)` : ""}` });
  }
  if (f.quarters.length >= 8 && f.quarters.every((q) => q.profit !== null)) {
    const sum = (qs: Quarter[]) => qs.reduce((s, q) => s + (q.profit ?? 0), 0);
    const g = growth(sum(f.quarters.slice(0, 4)), sum(f.quarters.slice(4, 8)));
    if (g !== null) notes.push({ tone: toneOf(g), text: `Lợi nhuận 4 quý gần nhất ${ty(sum(f.quarters.slice(0, 4)))} (${pct(g)} so 4 quý trước)` });
  }

  const val = [
    f.pe !== null && f.pe > 0 && `P/E ${f.pe.toFixed(1)}`,
    f.pb !== null && f.pb > 0 && `P/B ${f.pb.toFixed(1)}`,
    f.marketCap !== null && `vốn hóa ${ty(f.marketCap)}`,
  ].filter(Boolean);
  if (val.length) notes.push({ tone: "info", text: `Định giá: ${val.join(" · ")}` });
  if (f.roe !== null) {
    const roe = f.roe * 100;
    notes.push({
      tone: roe >= 15 ? "good" : roe < 5 ? "bad" : "info",
      text: `ROE ${roe.toFixed(1)}% — ${roe >= 15 ? "sinh lời tốt trên vốn chủ" : roe < 5 ? "sinh lời thấp trên vốn chủ" : "sinh lời trung bình"}`,
    });
  }
  if (f.divYield !== null && f.divYield >= 0.04) notes.push({ tone: "good", text: `Cổ tức tiền mặt ~${(f.divYield * 100).toFixed(1)}%/năm theo giá hiện tại` });
  if (f.news.some((n) => n.type === "GD cổ đông lớn/nội bộ"))
    notes.push({ tone: "info", text: "Có báo cáo giao dịch của cổ đông lớn / người nội bộ gần đây — mở tin để xem họ mua hay bán" });
  if (q0 && now - new Date(q0.fiscalDate).getTime() > 200 * 86400e3)
    notes.push({ tone: "bad", text: `Số liệu quý mới nhất là ${q0.period} — đã cũ, doanh nghiệp có thể chậm công bố BCTC` });
  return notes;
}

/** Nhận định tổng: đếm điểm tốt/xấu. */
export function fundamentalVerdict(notes: FundNote[]): { tone: FundNote["tone"]; text: string } {
  const good = notes.filter((n) => n.tone === "good").length;
  const bad = notes.filter((n) => n.tone === "bad").length;
  if (!notes.length) return { tone: "info", text: "Chưa có dữ liệu kinh doanh" };
  if (bad > good) return { tone: "bad", text: "Kinh doanh kém — cẩn trọng, tín hiệu chỉ dựa vào giá" };
  if (good > bad) return { tone: "good", text: "Kinh doanh tích cực — ủng hộ tín hiệu" };
  return { tone: "info", text: "Kinh doanh trung tính" };
}

const ICON = { good: "✅", bad: "⚠️", info: "•" } as const;
// Tin ưu tiên hiện trên Telegram (chỉ 3 tin)
const IMPORTANT = ["GD cổ đông lớn/nội bộ", "BCTC", "Cổ tức", "Phát hành", "ĐHCĐ"];
/** "FPT: Nghị quyết..." → "Nghị quyết..." */
export const stripTicker = (title: string, ticker: string) => (title.startsWith(`${ticker}:`) ? title.slice(ticker.length + 1).trim() : title);

/** Khối "Kinh doanh + tin công bố" cho tin nhắn Telegram (HTML, đã escape). */
export function formatFundamentalsTg(f: Fundamentals, now = Date.now()): string {
  const notes = summarizeFundamentals(f, now);
  const v = fundamentalVerdict(notes);
  const lines = [`🏢 <b>Kinh doanh</b> — ${ICON[v.tone]} ${esc(v.text)}`, ...notes.map((n) => `${ICON[n.tone]} ${esc(n.text)}`)];
  if (f.news.length) {
    lines.push("", "📰 <b>Tin gần đây</b>");
    const rank = (n: NewsItem) => IMPORTANT.indexOf(n.type) + 1 || 99;
    for (const n of [...f.news].sort((a, b) => rank(a) - rank(b) || b.date.localeCompare(a.date)).slice(0, 3)) {
      const title = esc(stripTicker(n.title, f.ticker));
      const link = n.url ? `<a href="${esc(n.url).replace(/"/g, "&quot;")}">${title}</a>` : title;
      lines.push(`• ${n.date.slice(5).split("-").reverse().join("/")} [${esc(n.type)}] ${link}`);
    }
  }
  return lines.join("\n");
}
