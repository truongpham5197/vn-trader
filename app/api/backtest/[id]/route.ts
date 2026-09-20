import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = await prisma.backtestRun.findUnique({ where: { id: Number(id) } });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    ...run,
    metrics: JSON.parse(run.metrics),
    equity: JSON.parse(run.equity),
    trades: JSON.parse(run.trades),
  });
}
