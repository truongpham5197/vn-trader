import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLegacyRun, parseStoredCfg, BACKTEST_LIMITATIONS, ENGINE_VERSION } from "@/lib/backtest/report";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = await prisma.backtestRun.findUnique({ where: { id: Number(id) } });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  const metrics = JSON.parse(run.metrics);
  return NextResponse.json({
    ...run,
    metrics,
    equity: JSON.parse(run.equity),
    trades: JSON.parse(run.trades),
    cfg: parseStoredCfg(run.params),
    legacy: isLegacyRun(metrics, run.params),
    engineVersion: ENGINE_VERSION,
    limitations: BACKTEST_LIMITATIONS,
  });
}
