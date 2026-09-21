import Link from "next/link";
import { prisma } from "@/lib/prisma";
import SignalTable from "../components/SignalTable";

export const dynamic = "force-dynamic";

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const signals = await prisma.signal.findMany({
    where: date ? { date } : {},
    include: { symbol: true, strategy: true },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 200,
  });

  return (
    <main className="mx-auto max-w-5xl p-6 text-sm">
      <Link href="/" className="text-accent hover:underline">
        ← dashboard
      </Link>
      <h1 className="my-4 text-xl font-bold tracking-tight">
        Tín hiệu {date ? `ngày ${date}` : "(200 gần nhất)"} — {signals.length}
      </h1>
      {signals.length === 0 ? (
        <p className="card p-4 text-muted">Chưa có tín hiệu nào.</p>
      ) : (
        <SignalTable signals={signals} />
      )}
    </main>
  );
}
