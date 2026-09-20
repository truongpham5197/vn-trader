import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { vnToday } from "@/lib/vn-time";
import { getBool, getNum } from "@/lib/settings";
import SignalTable from "./components/SignalTable";

export const dynamic = "force-dynamic";

export default async function Home() {
  const today = vnToday();
  const [symbolCount, barCount, todaySignals, latestSignal] = await Promise.all([
    prisma.symbol.count({ where: { active: true } }),
    prisma.dailyBar.count(),
    prisma.signal.findMany({
      where: { date: today },
      include: { symbol: true, strategy: true },
      orderBy: { id: "desc" },
    }),
    prisma.dailyBar.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
  ]);
  const [scanEnabled, paper, kill] = await Promise.all([
    getBool("scanEnabled"),
    getBool("paperTrading"),
    getBool("killSwitch"),
  ]);
  const nav = await getNum("navVnd");

  return (
    <main className="mx-auto max-w-4xl p-6 font-mono text-sm">
      <h1 className="mb-4 text-xl font-bold">VN Trading Assistant</h1>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Symbols" value={symbolCount} />
        <Stat label="Daily bars" value={barCount} />
        <Stat label="Data mới nhất" value={latestSignal?.date ?? "—"} />
        <Stat label="NAV" value={`${(nav / 1e6).toFixed(0)}tr`} />
      </div>

      <div className="mb-6 flex gap-4 text-xs">
        <Badge ok={scanEnabled}>scanner {scanEnabled ? "ON" : "OFF"}</Badge>
        <Badge ok={paper}>paper {paper ? "ON" : "OFF"}</Badge>
        <Badge ok={!kill}>kill {kill ? "ON 🛑" : "off"}</Badge>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Tín hiệu hôm nay ({today}) — {todaySignals.length}</h2>
        <Link href="/signals" className="text-blue-400 underline">
          tất cả →
        </Link>
      </div>

      {todaySignals.length === 0 ? (
        <p className="text-neutral-500">Chưa có tín hiệu. Cron scan chạy 15:40 T2–T6.</p>
      ) : (
        <SignalTable signals={todaySignals} />
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-neutral-800 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg">{value}</div>
    </div>
  );
}

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`rounded px-2 py-1 ${ok ? "bg-emerald-900/50" : "bg-red-900/50"}`}>
      {children}
    </span>
  );
}
