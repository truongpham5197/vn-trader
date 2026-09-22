"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NavEditor({
  nav,
  riskPct,
  universe,
  topPicks,
}: {
  nav: number;
  riskPct: number;
  universe: string;
  topPicks: boolean;
}) {
  const router = useRouter();
  const [navV, setNavV] = useState((nav / 1e6).toString());
  const [riskV, setRiskV] = useState(riskPct.toString());
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(key: string, value: string) {
    setState("saving");
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setState(res.ok ? "saved" : "error");
    if (res.ok) router.refresh();
  }

  return (
    <div className="card p-3">
      <div className="text-xs text-muted">Cấu hình (lưu ngay khi sửa)</div>
      <div className="mt-2 flex flex-wrap items-end gap-3 text-xs">
        <label className="flex flex-col gap-1 text-muted">
          NAV (triệu đ)
          <input
            value={navV}
            onChange={(e) => setNavV(e.target.value)}
            onBlur={() => save("navVnd", String(Number(navV) * 1e6))}
            className="num w-28 rounded border border-border bg-background px-2 py-1.5 text-foreground focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-muted">
          Risk/lệnh (%)
          <input
            value={riskV}
            onChange={(e) => setRiskV(e.target.value)}
            onBlur={() => save("riskPct", riskV)}
            className="num w-16 rounded border border-border bg-background px-2 py-1.5 text-foreground focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-muted">
          Universe quét
          <select
            defaultValue={universe}
            onChange={(e) => save("universe", e.target.value)}
            className="rounded border border-border bg-card px-2 py-1.5 text-foreground focus:border-accent focus:outline-none"
          >
            <option value="vn30">VN30 (30 mã)</option>
            <option value="liquid">Liquid (GTGD&gt;5tỷ)</option>
            <option value="all">All (toàn TT)</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-muted">
          <input
            type="checkbox"
            defaultChecked={topPicks}
            onChange={(e) => save("topPicksEnabled", String(e.target.checked))}
            className="accent-accent"
          />
          Telegram top-5 digest
        </label>
        {state === "saving" && <span className="text-muted">đang lưu…</span>}
        {state === "saved" && <span className="text-gain">✓ đã lưu</span>}
        {state === "error" && <span className="text-loss">lỗi</span>}
      </div>
    </div>
  );
}
