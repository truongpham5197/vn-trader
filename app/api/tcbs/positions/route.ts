import { NextResponse } from "next/server";
import { syncPositions } from "@/lib/tcbs/watcher";
import { tcbsConfigured } from "@/lib/tcbs/client";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!tcbsConfigured()) {
    return NextResponse.json({ error: "TCBS chưa cấu hình" }, { status: 400 });
  }
  try {
    const n = await syncPositions();
    return NextResponse.json({ synced: n });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "sync failed" },
      { status: 500 },
    );
  }
}
