import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runBacktestFromDb } from "@/lib/backtest/run";
import { STRATEGIES } from "@/lib/strategy";
import { cronAuthorized, cronForbidden } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const runs = await prisma.backtestRun.findMany({
    orderBy: { id: "desc" },
    take: 50,
    select: {
      id: true,
      strategyType: true,
      params: true,
      universe: true,
      periodStart: true,
      periodEnd: true,
      metrics: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ strategies: Object.keys(STRATEGIES), runs });
}

export async function POST(req: Request) {
  if (!cronAuthorized(req)) return cronForbidden();
  const body = (await req.json().catch(() => null)) as {
    strategyType?: string;
    params?: Record<string, number>;
    universe?: string;
    fromDate?: string;
    toDate?: string;
  } | null;
  if (!body?.strategyType || !body.fromDate || !body.toDate) {
    return NextResponse.json(
      { error: "cần strategyType, fromDate, toDate" },
      { status: 400 },
    );
  }
  try {
    const r = await runBacktestFromDb({
      strategyType: body.strategyType,
      params: body.params,
      universe: body.universe ?? "liquid",
      fromDate: body.fromDate,
      toDate: body.toDate,
    });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "backtest failed" },
      { status: 500 },
    );
  }
}
