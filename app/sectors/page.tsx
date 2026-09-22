import Link from "next/link";
import { unstable_cache } from "next/cache";
import { buildSectorBoard } from "@/lib/report/sectors";
import { loadSectorStrength } from "@/lib/analysis/sector-strength";
import SectorBoard from "../components/SectorBoard";
import SectorStrength from "../components/SectorStrength";

export const dynamic = "force-dynamic";

// Xếp hạng ngành dựa trên nến ngày — tính ~160 mã tốn vài giây, cache 15 phút
const cachedStrength = unstable_cache(loadSectorStrength, ["sector-strength"], { revalidate: 900 });

export default async function SectorsPage() {
  const [strength, rows] = await Promise.all([cachedStrength(), buildSectorBoard()]);

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl p-4 text-sm sm:p-6">
      <Link href="/" className="text-accent hover:underline">
        ← dashboard
      </Link>
      <h1 className="my-4 text-xl font-bold tracking-tight">Nhóm ngành</h1>
      <SectorStrength data={strength} />

      <h2 className="mt-10 mb-3 text-lg font-bold tracking-tight">
        Mã đang theo dõi — {rows.length} mã <span className="text-xs font-normal text-muted">(giá gần realtime)</span>
      </h2>
      <SectorBoard rows={rows} />
    </main>
  );
}
