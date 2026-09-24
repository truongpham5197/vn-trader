import { esc } from "../telegram/notify";
import { say, type Persona } from "../persona";
import { adviceStyle } from "../persona-style";
import { positionSize } from "../risk/sizing";
import { BUY_FEE } from "../fees";
import { px } from "../format";
import { strategyLabel } from "../strategy/labels";
import { losingRecord, recordLine, OUTCOME_TEXT, type Outcome, type OutcomeStats } from "./signal-outcome";

/** Tin gợi ý riêng từng user: giọng riêng + xếp theo rổ đang giữ + trả bài gợi ý cũ. */

export interface DigestSignal {
  id: number;
  ticker: string;
  sector: string | null;
  strategy: string; // type
  entry: number;
  stop: number;
  target: number;
  rr: number;
  buyZone: [number, number] | null;
  reason: string | null;
}

export interface DigestHolding {
  ticker: string;
  sector: string | null;
  price: number | null;
  stop: number | null;
}

export interface DigestGraded {
  ticker: string;
  strategy: string;
  date: string;
  outcome: Outcome;
  pct: number | null;
  taken: boolean; // user đã mua theo gợi ý này
}

export interface DigestInput {
  persona: Persona;
  variant?: number; // thứ tự trong nhóm cùng phong cách — cùng phong cách vẫn khác câu
  name: string;
  seed: string; // ngày — câu đổi theo ngày, ổn định trong ngày
  signals: DigestSignal[];
  holdings: DigestHolding[];
  watchlist: string[];
  nav: number;
  cash: number;
  riskPct: number;
  records: Record<string, OutcomeStats>;
  graded: DigestGraded[];
  exits: { ticker: string; reason: string }[];
}

export const MAX_PICKS = 5;

export interface RankedPick {
  s: DigestSignal;
  strategies: string[];
  score: number;
  notes: string[];
  qty: number;
}

/**
 * Xếp gợi ý theo rổ user: bỏ mã đang giữ (không trung bình giá), gộp mã nhiều chiến lược cùng báo,
 * ưu tiên mã trong danh sách theo dõi, trừ điểm mã trùng ngành đang giữ, loại chiến lược đang thua
 * trên thành tích thật. Không đổi tham số chiến lược.
 */
export function rankForUser(i: Pick<DigestInput, "signals" | "holdings" | "watchlist" | "nav" | "cash" | "riskPct" | "records">): {
  picks: RankedPick[];
  held: string[];
  weak: string[];
} {
  const heldSet = new Set(i.holdings.map((h) => h.ticker));
  const heldSectors = new Map<string, string[]>();
  for (const h of i.holdings) if (h.sector) heldSectors.set(h.sector, [...(heldSectors.get(h.sector) ?? []), h.ticker]);
  const watch = new Set(i.watchlist);
  const byTicker = new Map<string, DigestSignal[]>();
  const held = new Set<string>();
  const weak = new Set<string>();
  for (const s of i.signals) {
    if (heldSet.has(s.ticker)) held.add(s.ticker);
    else if (i.records[s.strategy] && losingRecord(i.records[s.strategy])) weak.add(s.ticker);
    else byTicker.set(s.ticker, [...(byTicker.get(s.ticker) ?? []), s]);
  }
  for (const t of byTicker.keys()) weak.delete(t);

  const picks: RankedPick[] = [...byTicker.values()].map((xs) => {
    const s = [...xs].sort((a, b) => b.rr - a.rr)[0];
    const notes: string[] = [];
    let score = s.rr;
    if (xs.length > 1) {
      score += 0.5 * (xs.length - 1);
      notes.push(`${xs.length} chiến lược cùng báo`);
    }
    if (watch.has(s.ticker)) {
      score += 1;
      notes.push("nằm trong danh sách theo dõi của bạn");
    }
    const same = s.sector ? heldSectors.get(s.sector) : undefined;
    if (same?.length) {
      score -= 1.5;
      notes.push(`cùng ngành với ${same.join(", ")} bạn đang giữ — mua thêm là dồn rủi ro 1 ngành`);
    }
    const size = positionSize({ navVnd: i.nav, riskPct: i.riskPct, entry: s.entry, stop: s.stop });
    const byCash = Math.floor(Math.max(i.cash, 0) / (s.entry * 1000 * (1 + BUY_FEE)) / 100) * 100;
    const qty = Math.max(Math.min(size.qty, byCash), 0);
    if (qty < size.qty) notes.push(qty ? "KL đã giảm theo tiền mặt còn lại" : "tiền mặt không đủ 1 lô 100cp");
    return { s, strategies: xs.map((x) => x.strategy), score, notes, qty };
  });
  picks.sort((a, b) => b.score - a.score || a.s.ticker.localeCompare(b.s.ticker));
  return { picks, held: [...held].sort(), weak: [...weak].sort() };
}

const sg = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

/** HTML parse_mode — mọi chuỗi động qua esc(). null khi không có gì để nói. */
export function buildDigest(i: DigestInput): string | null {
  const { picks, held, weak } = rankForUser(i);
  if (!picks.length && !held.length && !weak.length && !i.graded.length && !i.exits.length) return null;
  const p = i.persona;
  const n = esc(i.name || "bạn");
  const line = (slot: Parameters<typeof say>[1], t = "", k = "") => esc(say(p, slot, { t, n: i.name || "bạn" }, `${i.seed}|${k || t}`, i.variant ?? 0));
  const st = adviceStyle(p.id, i.variant ?? 0);
  const out: string[] = [`${p.emoji} <b>${line("greet")}</b>`];

  const broken = i.holdings.filter((h) => h.price !== null && h.stop !== null && h.price <= h.stop).map((h) => h.ticker);
  if (broken.length) {
    out.push(``, `🛑 Trước khi mua mới: ${esc(broken.join(", "))} của ${n} đang dưới cắt lỗ. ${esc(st.text("Lời khuyên: xử lý mấy mã đó trước, app không bán hộ."))}`);
  }

  if (i.exits.length) {
    out.push(``, `🚪 <b>Mã đang giữ phạm luật thoát của chiến lược</b>`);
    for (const e of i.exits) out.push(`• ${line("exit", e.ticker)} (${esc(e.reason)}). ${esc(st.text("Lời khuyên: cân nhắc bán, app không bán hộ."))}`);
  }

  if (picks.length) {
    out.push(``, `🟢 <b>Gợi ý mua cho ${n}</b> (${Math.min(picks.length, MAX_PICKS)}/${picks.length})`);
    for (const k of picks.slice(0, MAX_PICKS)) {
      const s = k.s;
      const zone = s.buyZone ? `vùng mua ${px(s.buyZone[0])}–${px(s.buyZone[1])}` : `giá vào ${px(s.entry)}`;
      const stopPct = ((s.entry - s.stop) / s.entry) * 100;
      const tgtPct = ((s.target - s.entry) / s.entry) * 100;
      out.push(
        `• <b>${esc(s.ticker)}</b> — ${line("buy", s.ticker)}` +
          `\n  ${zone} · cắt lỗ ${px(s.stop)} (−${stopPct.toFixed(1)}%) · chốt ${px(s.target)} (+${tgtPct.toFixed(1)}%) · R:R ${s.rr.toFixed(1)}` +
          `\n  ${k.qty ? `KL theo vốn của ${n}: <b>${k.qty.toLocaleString("en-US")}cp</b>` : "Chưa đủ tiền cho 1 lô"} · ${esc(k.strategies.map(strategyLabel).join(" + "))}` +
          (k.notes.length ? `\n  ↳ ${esc(k.notes.join("; "))}` : ""),
      );
    }
    if (picks.length > MAX_PICKS) out.push(`… và ${picks.length - MAX_PICKS} mã nữa ở trang Gợi ý mua.`);
  }

  if (held.length) {
    out.push(``, `👜 <b>Trùng mã ${n} đang giữ</b>`);
    for (const t of held) out.push(`• ${line("held", t)}.`);
  }

  if (weak.length) {
    out.push(``, `🙈 Chiến lược đang thua trên gợi ý thật nên chỉ để xem, không xếp vào gợi ý: ${esc(weak.join(", "))}.`);
  }

  if (i.graded.length) {
    out.push(``, `📒 <b>Trả bài gợi ý cũ</b>`);
    const slot = { win: "win", loss: "loss", time: "flat", missed: "flat" } as const;
    for (const g of [...i.graded].sort((a, b) => Number(b.taken) - Number(a.taken)).slice(0, 6)) {
      const pct = g.pct === null ? "" : ` (${sg(g.pct)} sau phí)`;
      const mine = g.taken ? ` <b>${n} đã mua theo gợi ý này${g.outcome === "loss" ? " — app xin lỗi" : ""}.</b>` : "";
      out.push(`• ${line(slot[g.outcome], g.ticker, `${g.ticker}${g.date}`)}: ${esc(g.date)} → ${OUTCOME_TEXT[g.outcome]}${pct}.${mine}`);
    }
  }

  const types = [...new Set([...picks.flatMap((k) => k.strategies), ...i.graded.map((g) => g.strategy)])];
  const recs = types.filter((t) => i.records[t]).map((t) => `• ${esc(recordLine(i.records[t], strategyLabel(t)))}`);
  if (recs.length) out.push(``, `📊 <b>Thành tích gợi ý thật (120 ngày)</b>`, ...recs);

  out.push(
    ``,
    `🤝 ${line("bye")}`,
    `<i>Mô phỏng theo nến ngày, không phải lệnh khớp thật. Gợi ý không phải lời hứa lãi; +5% là mục tiêu bạn đặt, không phải cam kết.</i>`,
  );
  return out.join("\n");
}
