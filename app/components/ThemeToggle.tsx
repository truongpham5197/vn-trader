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

/** Nền tối là mặc định. Nút đổi sang nền sáng và nhớ trên máy này. */
export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    setLight(document.documentElement.classList.contains("light"));
  }, []);
  return (
    <button
      type="button"
      aria-label={light ? "Bật nền tối" : "Bật nền sáng"}
      title={light ? "Nền tối" : "Nền sáng"}
      onClick={() => {
        const next = !document.documentElement.classList.contains("light");
        apply(next);
        setLight(next);
      }}
      className="shrink-0 rounded-md border border-border px-2 py-1 text-sm leading-none text-muted hover:text-foreground"
    >
      {light ? "🌙" : "☀️"}
    </button>
  );
}
