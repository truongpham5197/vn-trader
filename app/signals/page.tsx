import Link from "next/link";
import { prisma } from "@/lib/prisma";
import SignalTable from "../components/SignalTable";
import { GUEST, currentUser } from "@/lib/user";
import { latestSignalDate } from "@/lib/signals";

export const dynamic = "force-dynamic";

const TABS = [
  ["pending", "Chờ xử lý", ["new", "notified"]],
  ["taken", "Đã mua", ["taken", "filled", "ordered"]],
  ["skipped", "Bỏ qua", ["skipped", "expired"]],
  ["all", "Tất cả", null],
] as const;

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; status?: string }>;
}) {
  const [sp, u, latestSession] = await Promise.all([searchParams, currentUser().then((x) => x ?? GUEST), latestSignalDate()]);
  const dates = (
    await prisma.signal.groupBy({ by: ["date"], _count: { _all: true }, orderBy: { date: "desc" }, take: 10 })
  ).map((d) => ({ date: d.date, n: d._count._all }));
  if (latestSession && !dates.some((d) => d.date === latestSession)) dates.unshift({ date: latestSession, n: 0 });
  const date = sp.date === "all" ? undefined : (sp.date ?? latestSession ?? dates[0]?.date);
  const tab = TABS.find((t) => t[0] === sp.status) ?? TABS[3];
  const signals = await prisma.signal.findMany({
    where: { ...(date && { date }), ...(tab[2] && { status: { in: [...tab[2]] } }) },
    include: { symbol: true, strategy: true },
    orderBy: [{ date: "desc" }, { rr: "desc" }],
    take: 300,
  });
  const q = (p: { date?: string; status?: string }) => {
    const u = new URLSearchParams({ date: p.date ?? date ?? "all", status: p.status ?? tab[0] });
    return `/signals?${u}`;
  };
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition-colors ${
      active ? "border-accent bg-accent/15 text-foreground" : "border-border text-muted hover:border-accent hover:text-foreground"
    }`;

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl p-4 text-sm sm:p-6">
      <h1 className="text-xl font-bold tracking-tight">Gợi ý mua</h1>
      <p className="mt-1 mb-4 text-xs text-muted">
        Tín hiệu từ nến ngày đã đóng, dùng cho phiên kế. Bấm mã để xem lý do.{" "}
        <Link href="/signals/evidence" className="text-accent hover:underline">Sau khi báo, giá đi đâu? →</Link>
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        {dates.map((d) => (
          <Link key={d.date} href={q({ date: d.date })} prefetch={false} className={`num ${chip(d.date === date)}`}>
            {d.date.slice(5)} <span className="text-muted">· {d.n}</span>
          </Link>
        ))}
        <Link href={q({ date: "all" })} prefetch={false} className={chip(!date)}>
          Mọi ngày
        </Link>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([k, label]) => (
          <Link key={k} href={q({ status: k })} prefetch={false} className={chip(k === tab[0])}>
            {label}
          </Link>
        ))}
      </div>

      {signals.length === 0 ? (
        <p className="card p-6 text-center text-muted">Không có tín hiệu nào khớp bộ lọc.</p>
      ) : (
        <SignalTable signals={signals} showDate={!date} owner={u.owner} latestSession={latestSession} />
      )}
    </main>
  );
}
