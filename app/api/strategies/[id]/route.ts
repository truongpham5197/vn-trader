import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bad, body } from "@/lib/api";
import { STRATEGIES } from "@/lib/strategy";

export const dynamic = "force-dynamic";

// Bật/tắt chiến lược + sửa tham số (chỉ key có trong defaults, số dương). params={} → về mặc định.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const st = await prisma.strategy.findUnique({ where: { id } });
  const impl = st && STRATEGIES[st.type];
  if (!st || !impl) return bad("Không tìm thấy chiến lược", 404);
  const b = await body<{ enabled: boolean; params: Record<string, unknown> }>(req);

  let next: Record<string, number> | undefined;
  if (b.params) {
    next = { ...impl.defaults };
    for (const [k, v] of Object.entries(b.params)) {
      if (!(k in impl.defaults)) return bad(`Tham số lạ: ${k}`);
      const n = Number(String(v).replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) return bad(`${k} phải là số dương`);
      next[k] = n;
    }
  }
  await prisma.strategy.update({
    where: { id },
    data: {
      ...(typeof b.enabled === "boolean" && { enabled: b.enabled }),
      ...(next && { params: JSON.stringify(next) }),
    },
  });
  return NextResponse.json({ ok: true });
}
