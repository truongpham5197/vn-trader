"use client";

import { useEffect, useState } from "react";

const KEY = "vt_theme";

function apply(light: boolean) {
  document.documentElement.classList.toggle("light", light);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#f4f6f8" : "#0b0e14");
  try {
    localStorage.setItem(KEY, light ? "light" : "dark");
  } catch {
    /* private mode */
  }
}

function useTheme() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    setLight(document.documentElement.classList.contains("light"));
  }, []);
  const set = (next: boolean) => {
    apply(next);
    setLight(next);
  };
  return [light, set] as const;
}

/** Nút trên menu — hiện nền đang dùng, bấm để đổi. */
export function ThemeToggle() {
  const [light, set] = useTheme();
  return (
    <button
      type="button"
      aria-label={light ? "Đang nền sáng, bấm để đổi nền tối" : "Đang nền tối, bấm để đổi nền sáng"}
      title={light ? "Đổi sang nền tối" : "Đổi sang nền sáng"}
      onClick={() => set(!light)}
      className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:border-accent"
    >
      {light ? "☀️ Sáng" : "🌙 Tối"}
    </button>
  );
}

/** Khối trong Cài đặt — chọn nền sáng hoặc tối. */
export function ThemeCard() {
  const [light, set] = useTheme();
  const btn = (on: boolean) =>
    `rounded-md border px-3 py-1.5 font-medium ${on ? "border-accent bg-accent/15 text-foreground" : "border-border text-muted"}`;
  return (
    <div className="card p-4 text-xs">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn(!light)} onClick={() => set(false)}>
          🌙 Nền tối
        </button>
        <button type="button" className={btn(light)} onClick={() => set(true)}>
          ☀️ Nền sáng
        </button>
      </div>
      <p className="mt-2 text-muted">Đang dùng nền {light ? "sáng" : "tối"}. Nhớ trên máy này, máy khác không đổi theo.</p>
    </div>
  );
}
