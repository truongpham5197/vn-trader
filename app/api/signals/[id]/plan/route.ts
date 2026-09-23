import { NextResponse } from "next/server";
import { NEED_USER, currentUser } from "@/lib/user";
import { bad } from "@/lib/api";
import { getPersonalSignalPlan, realPersonalPlanDeps } from "@/lib/risk/personal";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/signals/:id/plan?entry= — gợi ý KL theo vốn/vị thế user cookie, không dùng qty tín hiệu dùng chung. */
export async function GET(req: Request, { params }: Ctx) {
  const u = await currentUser();
  if (!u) return bad(NEED_USER, 401);
  const id = Number((await params).id);
  const sp = new URL(req.url).searchParams;
  const r = await getPersonalSignalPlan(u, id, { entry: sp.get("entry"), userId: sp.get("userId") }, await realPersonalPlanDeps());
  return NextResponse.json(r.body, { status: r.status });
}
