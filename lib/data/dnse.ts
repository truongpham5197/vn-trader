import type { Bar } from "./types";
import { fetchJson } from "./http";

const BASE = "https://services.entrade.com.vn/chart-api/v2/ohlcs";

interface OhlcResponse {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
}

function toVnDate(epochSec: number): string {
  return new Date(epochSec * 1000).toLocaleDateString("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

/** OHLCV ngày của 1 mã cổ phiếu, sort tăng dần theo ngày. Giá: nghìn đồng. */
export async function fetchDailyBars(
  ticker: string,
  fromDate: Date,
  toDate: Date,
): Promise<Bar[]> {
  const from = Math.floor(fromDate.getTime() / 1000);
  const to = Math.floor(toDate.getTime() / 1000);
  const url = `${BASE}/stock?from=${from}&to=${to}&symbol=${encodeURIComponent(ticker)}&resolution=1D`;
  const json = await fetchJson<OhlcResponse>(url);
  if (!json.t?.length) return [];
  const bars: Bar[] = json.t.map((t, i) => ({
    date: toVnDate(t),
    open: json.o[i],
    high: json.h[i],
    low: json.l[i],
    close: json.c[i],
    volume: json.v[i],
  }));
  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

/** OHLC chỉ số (VNINDEX...) */
export async function fetchIndexBars(
  index: string,
  fromDate: Date,
  toDate: Date,
): Promise<Bar[]> {
  const from = Math.floor(fromDate.getTime() / 1000);
  const to = Math.floor(toDate.getTime() / 1000);
  const url = `${BASE}/index?from=${from}&to=${to}&symbol=${encodeURIComponent(index)}&resolution=1D`;
  const json = await fetchJson<OhlcResponse>(url);
  if (!json.t?.length) return [];
  return json.t
    .map((t, i) => ({
      date: toVnDate(t),
      open: json.o[i],
      high: json.h[i],
      low: json.l[i],
      close: json.c[i],
      volume: json.v?.[i] ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
