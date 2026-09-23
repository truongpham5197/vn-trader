import { NextResponse } from "next/server";

/** Số dương hữu hạn hoặc null — validate body từ web (nhận cả "91,5"). */
export const pos = (v: unknown): number | null => {
  const s = String(v ?? "").trim().replace(",", ".");
  const n = Number(s);
  return s !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export const body = async <T>(req: Request) => ((await req.json().catch(() => null)) ?? {}) as Partial<T>;
