import type { ListedSymbol } from "./types";
import { fetchJson } from "./http";

const BASE = "https://api-finfo.vndirect.com.vn/v4";

export const BAND_PCT: Record<string, number> = {
  HOSE: 0.07,
  HNX: 0.1,
  UPCOM: 0.15,
};

/**
 * List theo từng sàn, size=1000 → mỗi sàn 1 request, tránh pagination
 * drift của VNDirect (mất/trùng record khi lật nhiều page).
 * Gồm cả chứng chỉ quỹ (ETF + IFC, ~31 mã, hầu hết HOSE) → kind "fund".
 */
export async function listListedSymbols(): Promise<ListedSymbol[]> {
  const byTicker = new Map<string, ListedSymbol>();
  for (const floor of Object.keys(BAND_PCT)) {
    const url = `${BASE}/stocks?q=type:STOCK~status:LISTED~floor:${floor}&size=1000`;
    const json = await fetchJson<{
      data: { code: string; floor: string; companyName?: string }[];
    }>(url);
    for (const s of json.data) {
      if (BAND_PCT[s.floor]) {
        byTicker.set(s.code, {
          ticker: s.code,
          exchange: s.floor,
          companyName: s.companyName ?? null,
          kind: "stock",
        });
      }
    }
  }
  const funds = await fetchJson<{
    data: { code: string; floor: string; companyName?: string }[];
  }>(`${BASE}/stocks?q=type:ETF,IFC~status:LISTED&size=200`).catch(() => null);
  for (const s of funds?.data ?? []) {
    if (BAND_PCT[s.floor]) {
      byTicker.set(s.code, {
        ticker: s.code,
        exchange: s.floor,
        companyName: s.companyName ?? null,
        kind: "fund",
      });
    }
  }
  return [...byTicker.values()];
}

/** Map ticker → tên ngành ICB cấp 2 (fallback cấp 1) từ VNDirect. */
export async function listSectors(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const level of [2, 1]) {
    const json = await fetchJson<{
      data: { industryLevel: string; vietnameseName: string; codeList: string }[];
    }>(`${BASE}/industry_classification?q=industryLevel:${level}&size=500`).catch(() => null);
    if (!json?.data?.length) continue;
    for (const ind of json.data) {
      const name = ind.vietnameseName.trim();
      for (const t of ind.codeList.split(",")) {
        const ticker = t.trim();
        if (ticker) map.set(ticker, name);
      }
    }
    if (map.size) break;
  }
  return map;
}
