"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import StockSearch from "./StockSearch";

const LINKS = [
  ["/", "Tổng quan"],
  ["/signals", "Tín hiệu"],
  ["/journal", "Vị thế & nhật ký"],
  ["/sectors", "Nhóm ngành"],
  ["/backtest", "Backtest"],
  ["/settings", "Cài đặt"],
] as const;

export default function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Link href="/" className="shrink-0 py-3 font-bold tracking-tight">
          📈 VN Trader
        </Link>
        <nav className="-mb-px flex min-w-0 gap-1 overflow-x-auto text-sm [scrollbar-width:none]">
          {LINKS.map(([href, label]) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`shrink-0 border-b-2 px-2.5 py-3 whitespace-nowrap transition-colors ${
                  active ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <StockSearch />
      </div>
    </header>
  );
}
