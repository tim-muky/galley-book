"use client";

import { Link, usePathname } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { clsx } from "clsx";

const navItems = [
  {
    href: "/library" as const,
    key: "library" as const,
    icon: () => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path
          d="M11 6.5C9 5 5.5 4.5 2.5 5v12c3-0.5 6.5 0 8.5 1.5 2-1.5 5.5-2 8.5-1.5V5c-3-0.5-6.5 0-8.5 1.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M11 6.5v12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/cook-next" as const,
    key: "cookNext" as const,
    icon: () => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path
          d="M7.5 2.5c-1 1.3 1 2.4 0 3.7M11 2.5c-1 1.3 1 2.4 0 3.7M14.5 2.5c-1 1.3 1 2.4 0 3.7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M2.5 8.5h17"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M3.75 8.5 5 17.25c0.18 1.27 1.27 2.25 2.55 2.25h6.9c1.28 0 2.37-0.98 2.55-2.25L18.25 8.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/new" as const,
    key: "add" as const,
    icon: () => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M11 7v8M7 11h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/recommendations" as const,
    key: "discover" as const,
    icon: () => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="9.5" cy="9.5" r="6" stroke="currentColor" strokeWidth="1.5"/>
        <path d="m14 14 5.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/settings" as const,
    key: "settings" as const,
    icon: () => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="3" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M11 2v2M11 18v2M2 11h2M18 11h2M4.22 4.22l1.42 1.42M16.36 16.36l1.42 1.42M4.22 17.78l1.42-1.42M16.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface-lowest/90 backdrop-blur-xl border-t border-surface-low z-50"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="max-w-lg mx-auto flex items-stretch">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-opacity",
                active ? "text-anthracite" : "text-on-surface-variant opacity-50 hover:opacity-75"
              )}
            >
              {item.icon()}
              <span
                className={clsx(
                  "text-[10px] tracking-wide",
                  active ? "font-semibold" : "font-light"
                )}
              >
                {t(item.key)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
