"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import StockSearch from "./StockSearch";
import UserSwitcher from "./UserSwitcher";
import AlertCenter from "./AlertCenter";
import { InstallButton } from "./InstallApp";
import { navActive } from "@/lib/nav";

// [href, nhãn desktop, icon mobile, nhãn ngắn mobile]
const LINKS = [
  ["/", "Tổng quan", "🏠", "Tổng quan"],
  ["/signals", "Tín hiệu", "📡", "Tín hiệu"],
  ["/signals/evidence", "Sau tín hiệu", "📊", "Sau báo"],
  ["/journal", "Vị thế", "💼", "Vị thế"],
  ["/sectors", "Nhóm ngành", "🏭", "Ngành"],
  ["/backtest", "Thử quá khứ", "🧪", "Thử cũ"],
  ["/settings", "Cài đặt", "⚙️", "Cài đặt"],
] as const;

export default function Nav({ username }: { username: string | null }) {
  const path = usePathname();
  const hrefs = LINKS.map(([href]) => href);
  const on = (href: string) => navActive(path, href, hrefs);
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 sm:px-6">
          <Link href="/" className="shrink-0 font-bold tracking-tight">
            📈<span className="hidden min-[480px]:inline"> VN Trader</span>
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <StockSearch />
            <InstallButton />
            <AlertCenter username={username} />
            <UserSwitcher username={username} />
          </div>
        </div>
        <nav className="mx-auto hidden max-w-6xl flex-wrap gap-1 px-4 pb-2 sm:flex sm:px-6">
          {LINKS.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={`rounded-md px-2.5 py-1 text-sm whitespace-nowrap ${
                on(href) ? "bg-accent/15 text-foreground" : "text-muted hover:bg-white/5 hover:text-foreground"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-7 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        {LINKS.map(([href, , icon, short]) => (
          <Link
            key={href}
            href={href}
            className={`flex min-w-0 flex-col items-center gap-0.5 px-0.5 py-1.5 text-center text-[10px] leading-tight ${on(href) ? "text-accent" : "text-muted"}`}
          >
            <span className="text-base leading-none">{icon}</span>
            {short}
          </Link>
        ))}
      </nav>
    </>
  );
}
