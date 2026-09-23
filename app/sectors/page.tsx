import { buildSectorBoard } from "@/lib/report/sectors";
import { currentSectorStrength } from "@/lib/analysis/sector-live";
import SectorBoard from "../components/SectorBoard";
import SectorStrength from "../components/SectorStrength";
import AutoRefresh from "../components/AutoRefresh";
import { GUEST, currentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

export default async function SectorsPage() {
  const u = (await currentUser()) ?? GUEST;
  const [strength, rows] = await Promise.all([currentSectorStrength(), buildSectorBoard(u.id)]);

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl p-4 text-sm sm:p-6">
      <h1 className="mb-4 text-xl font-bold tracking-tight">Nhóm ngành</h1>
      <AutoRefresh />
      <SectorStrength data={strength} />

      <h2 className="mt-10 mb-3 text-lg font-bold tracking-tight">
        Mã đang theo dõi — {rows.length} mã <span className="text-xs font-normal text-muted">(giá gần realtime)</span>
      </h2>
      <SectorBoard rows={rows} />
    </main>
  );
}
