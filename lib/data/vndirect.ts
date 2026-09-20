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
        });
      }
    }
  }
  return [...byTicker.values()];
}
