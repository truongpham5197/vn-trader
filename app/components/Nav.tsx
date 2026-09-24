"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import StockSearch from "./StockSearch";
import UserSwitcher from "./UserSwitcher";
import AlertCenter from "./AlertCenter";
import { InstallButton } from "./InstallApp";
import { ThemeToggle } from "./ThemeToggle";
import { navActive } from "@/lib/nav";

// [href, nhãn desktop, icon mobile, nhãn ngắn mobile]
const LINKS = [
  ["/", "Trang chủ", "🏠", "Trang chủ"],
  ["/signals", "Gợi ý mua", "📡", "Gợi ý"],
  ["/gia-sau", "Giá sau báo", "📊", "Giá sau"],
  ["/journal", "Vị thế", "💼", "Vị thế"],
  ["/sectors", "Nhóm ngành", "🏭", "Ngành"],
  ["/backtest", "Giả lập mua bán", "🧪", "Giả lập"],
  ["/settings", "Cài đặt", "⚙️", "Cài đặt"],
] as const;

export default function Nav({ username, owner }: { username: string | null; owner: boolean }) {
  const path = usePathname();
  const links = owner ? LINKS : LINKS.filter(([href]) => href !== "/gia-sau");
  const hrefs = links.map(([href]) => href);
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
            <ThemeToggle />
            <AlertCenter username={username} />
            <UserSwitcher username={username} />
          </div>
        </div>
        <nav className="mx-auto hidden max-w-6xl flex-wrap gap-1 px-4 pb-2 sm:flex sm:px-6">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              prefetch={false}
              className={`rounded-md px-2.5 py-1 text-sm whitespace-nowrap ${
                on(href) ? "bg-accent/15 text-foreground" : "text-muted hover:bg-foreground/5 hover:text-foreground"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <nav className={`fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden ${links.length > 6 ? "grid-cols-7" : "grid-cols-6"}`}>
        {links.map(([href, , icon, short]) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
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
