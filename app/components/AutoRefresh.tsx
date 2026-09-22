"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { inVnSession } from "@/lib/vn-time";

/** Trong phiên: tải lại dữ liệu server mỗi 5 phút (xếp hạng ngành có giá live). */
export default function AutoRefresh({ everyMs = 5 * 60e3 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => inVnSession() && router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return null;
}
