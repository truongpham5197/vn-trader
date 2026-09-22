import Link from "next/link";
import { buildSectorBoard } from "@/lib/report/sectors";
import SectorBoard from "../components/SectorBoard";

export const dynamic = "force-dynamic";

export default async function SectorsPage() {
  const rows = await buildSectorBoard();

  return (
    <main className="mx-auto max-w-6xl p-6 text-sm">
      <Link href="/" className="text-accent hover:underline">
        ← dashboard
      </Link>
      <h1 className="my-4 text-xl font-bold tracking-tight">
        Nhóm ngành — {rows.length} mã đang theo dõi
      </h1>
      <SectorBoard rows={rows} />
    </main>
  );
}
