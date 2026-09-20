import { prisma } from "../prisma";

const BASE = "https://openapi.tcbs.com.vn";

/**
 * TCBS iFlash OpenAPI client.
 * Auth: POST /gaia/v1/oauth2/openapi/token {apiKey, otp(iOTP từ app TCInvest)}
 * → JWT token, cache trong Setting 'tcbsToken'.
 * NOTE: chưa được test với tài khoản thật — verify theo
 * docs/specs/openapi-v1.0.0.json khi bật live.
 */

export function tcbsConfigured(): boolean {
  return Boolean(process.env.TCBS_API_KEY && process.env.TCBS_ACCOUNT_NO);
}

async function getToken(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: "tcbsToken" } });
  return row?.value ?? "";
}

export class TcbsAuthError extends Error {}

async function call<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 && !retried) {
    await prisma.setting.deleteMany({ where: { key: "tcbsToken" } });
    throw new TcbsAuthError("token hết hạn — cần OTP mới (/otp <code>)");
  }
  if (!res.ok) {
    throw new Error(`TCBS ${init?.method ?? "GET"} ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Đổi API key + OTP lấy JWT. OTP từ Smart OTP trong app TCInvest. */
export async function authenticate(otp: string): Promise<boolean> {
  const apiKey = process.env.TCBS_API_KEY;
  if (!apiKey) throw new Error("Thiếu TCBS_API_KEY trong .env");
  const res = await fetch(`${BASE}/gaia/v1/oauth2/openapi/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, otp }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return false;
  const json = (await res.json()) as { token?: string };
  if (!json.token) return false;
  await prisma.setting.upsert({
    where: { key: "tcbsToken" },
    update: { value: json.token },
    create: { key: "tcbsToken", value: json.token },
  });
  return true;
}

export type TcbsSide = "NB" | "NS"; // NB=buy, NS=sell
export type TcbsPriceType = "LO" | "MP" | "ATO" | "ATC" | "PLO";

export interface TcbsOrderResult {
  orderId?: string;
  status?: string;
  [k: string]: unknown;
}

/** Đặt lệnh cơ sở. price theo đơn vị API (thường VND — verify khi live). */
export async function placeOrder(opts: {
  side: TcbsSide;
  symbol: string;
  priceType: TcbsPriceType;
  price: number; // nghìn đồng — nhân 1000 khi gửi nếu API yêu cầu VND
  quantity: number;
}): Promise<TcbsOrderResult> {
  const accountNo = process.env.TCBS_ACCOUNT_NO ?? "";
  return call<TcbsOrderResult>(`/akhlys/v1/accounts/${accountNo}/orders`, {
    method: "POST",
    body: JSON.stringify({
      execType: opts.side,
      symbol: opts.symbol,
      priceType: opts.priceType,
      price: opts.price * 1000, // nghìn đồng → VND (verify khi live)
      quantity: opts.quantity,
    }),
  });
}

export interface TcbsPosition {
  symbol: string;
  quantity: number;
  sellableQty: number;
  avgPrice: number;
}

/** Tài sản cổ phiếu: GET /aion/v1/accounts/{acc}/se — parse phòng thủ. */
export async function getPositions(): Promise<TcbsPosition[]> {
  const accountNo = process.env.TCBS_ACCOUNT_NO ?? "";
  const json = await call<unknown>(`/aion/v1/accounts/${accountNo}/se`);
  const arr = (Array.isArray(json) ? json : (json as { data?: unknown[] }).data) ?? [];
  return (arr as Record<string, unknown>[]).map((r) => ({
    symbol: String(r.symbol ?? r.ticker ?? r.code ?? ""),
    quantity: Number(r.quantity ?? r.totalQty ?? r.qty ?? 0),
    sellableQty: Number(r.sellableQty ?? r.availableQty ?? r.quantity ?? 0),
    avgPrice: Number(r.avgPrice ?? r.averagePrice ?? r.costPrice ?? 0),
  }));
}

export interface TcbsOrder {
  orderId: string;
  symbol: string;
  side: string;
  price: number;
  quantity: number;
  filledQty: number;
  status: string;
}

export async function getOrder(orderId: string): Promise<TcbsOrder | null> {
  const accountNo = process.env.TCBS_ACCOUNT_NO ?? "";
  const json = await call<Record<string, unknown>>(
    `/aion/v1/accounts/${accountNo}/orders/${orderId}`,
  );
  if (!json) return null;
  const d = (json as { data?: Record<string, unknown> }).data ?? json;
  return {
    orderId: String(d.orderId ?? d.id ?? orderId),
    symbol: String(d.symbol ?? ""),
    side: String(d.execType ?? d.side ?? ""),
    price: Number(d.price ?? 0),
    quantity: Number(d.quantity ?? d.volume ?? 0),
    filledQty: Number(d.filledQty ?? d.matchedQty ?? d.filledQuantity ?? 0),
    status: String(d.status ?? d.orderStatus ?? ""),
  };
}

export async function getTodayOrders(): Promise<TcbsOrder[]> {
  const accountNo = process.env.TCBS_ACCOUNT_NO ?? "";
  const json = await call<unknown>(`/aion/v1/accounts/${accountNo}/orders`);
  const arr = (Array.isArray(json) ? json : (json as { data?: unknown[] }).data) ?? [];
  return (arr as Record<string, unknown>[]).map((d) => ({
    orderId: String(d.orderId ?? d.id ?? ""),
    symbol: String(d.symbol ?? ""),
    side: String(d.execType ?? d.side ?? ""),
    price: Number(d.price ?? 0),
    quantity: Number(d.quantity ?? d.volume ?? 0),
    filledQty: Number(d.filledQty ?? d.matchedQty ?? 0),
    status: String(d.status ?? d.orderStatus ?? ""),
  }));
}
