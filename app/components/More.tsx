"use client";

import { useState } from "react";

/** Chi tiết không cần để quyết định — bấm mới hiện. stopPropagation để không mở cả dòng bảng. */
export function More({ label = "Xem thêm", children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[11px] text-accent hover:underline">
        {open ? "▾ Ẩn" : `▸ ${label}`}
      </button>
      {open && <div className="mt-1 space-y-1">{children}</div>}
    </div>
  );
}
