"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import StockSearch from "./StockSearch";
import UserSwitcher from "./UserSwitcher";
import AlertCenter from "./AlertCenter";

// [href, nhãn desktop, icon mobile, nhãn ngắn mobile]
const LINKS = [
  ["/", "Tổng quan", "🏠", "Tổng quan"],
  ["/signals", "Tín hiệu", "📡", "Tín hiệu"],
  ["/journal", "Vị thế & nhật ký", "💼", "Vị thế"],
  ["/sectors", "Nhóm ngành", "🏭", "Ngành"],
  ["/backtest", "Backtest", "🧪", "Backtest"],
  ["/settings", "Cài đặt", "⚙️", "Cài đặt"],
] as const;

export default function Nav({ username }: { username: string | null }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
        <Link href="/" className="shrink-0 py-3 font-bold tracking-tight">
          📈<span className="hidden min-[480px]:inline"> VN Trader</span>
        </Link>
        <nav className="-mb-px hidden min-w-0 gap-1 overflow-x-auto text-sm [scrollbar-width:none] sm:flex">
          {LINKS.map(([href, label]) => {
            const active = isActive(href);
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
        <AlertCenter username={username} />
        <UserSwitcher username={username} />
      </div>
    </header>
    {/* Thanh tab đáy cho điện thoại — ngoài header vì backdrop-blur làm lệch position:fixed */}
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      {LINKS.map(([href, , icon, short]) => (
        <Link
          key={href}
          href={href}
          className={`flex flex-col items-center gap-0.5 py-1.5 text-[10px] leading-tight ${isActive(href) ? "text-accent" : "text-muted"}`}
        >
          <span className="text-base leading-none">{icon}</span>
          {short}
        </Link>
      ))}
    </nav>
    </>
  );
}
