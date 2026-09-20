"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunForm({ strategies }: { strategies: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/backtest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strategyType: f.get("strategyType"),
        universe: f.get("universe"),
        fromDate: f.get("fromDate"),
        toDate: f.get("toDate"),
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "failed");
    router.push(`/backtest?run=${json.runId}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mb-6 flex flex-wrap items-end gap-3 text-xs">
      <label className="flex flex-col gap-1">
        Chiến lược
        <select name="strategyType" className="rounded bg-neutral-900 p-2">
          {strategies.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Universe
        <select name="universe" className="rounded bg-neutral-900 p-2">
          <option value="liquid">liquid (GTGD&gt;5tỷ)</option>
          <option value="vn30">VN30</option>
          <option value="all">all (chậm)</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Từ
        <input
          name="fromDate"
          type="date"
          defaultValue="2023-01-01"
          className="rounded bg-neutral-900 p-2"
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        Đến
        <input
          name="toDate"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="rounded bg-neutral-900 p-2"
          required
        />
      </label>
      <button
        disabled={busy}
        className="rounded bg-emerald-700 px-4 py-2 disabled:opacity-50"
      >
        {busy ? "Đang chạy…" : "Chạy backtest"}
      </button>
      {error && <span className="text-red-400">{error}</span>}
    </form>
  );
}
