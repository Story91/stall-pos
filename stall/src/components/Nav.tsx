"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/useT";

const TABS = [
  { href: "/sell", key: "sell", glyph: "M4 9h16l-1.5 11h-13zM8 9V6a4 4 0 0 1 8 0v3" },
  { href: "/day", key: "day", glyph: "M5 4h14v16H5zM9 9h6M9 13h6M9 17h3" },
  { href: "/close", key: "close", glyph: "M4 12.5l5 5L20 6.5" },
  { href: "/history", key: "history", glyph: "M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4v4h4M12 7.5V12l3 2" },
  { href: "/settings", key: "settings", glyph: "M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6" },
] as const;

/** Bottom tabs for the owner's five screens. Fixed to the thumb zone, 64 px tall. */
export function Nav() {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav
      aria-label={t.nav.label}
      className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink bg-paper pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 px-0.5 text-center text-sm leading-tight font-semibold ${
                  active ? "bg-marigold text-ink" : "text-graphite active:bg-wash"
                }`}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="size-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2.75 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={tab.glyph} />
                </svg>
                {t.nav[tab.key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
