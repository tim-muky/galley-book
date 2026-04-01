"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const navItems = [
  {
    href: "/library",
    label: "Library",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="2" width="8" height="8" rx="1.5" stroke={active ? "#000" : "#474747"} strokeWidth="1.5"/>
        <rect x="12" y="2" width="8" height="8" rx="1.5" stroke={active ? "#000" : "#474747"} strokeWidth="1.5"/>
        <rect x="2" y="12" width="8" height="8" rx="1.5" stroke={active ? "#000" : "#474747"} strokeWidth="1.5"/>
        <rect x="12" y="12" width="8" height="8" rx="1.5" stroke={active ? "#000" : "#474747"} strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    href: "/new",
    label: "Add",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="9" stroke={active ? "#000" : "#474747"} strokeWidth="1.5"/>
        <path d="M11 7v8M7 11h8" stroke={active ? "#000" : "#474747"} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/recommendations",
    label: "Discover",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M11 2l2.09 6.26L19 11l-5.91 2.74L11 20l-2.09-6.26L3 11l5.91-2.74L11 2z" stroke={active ? "#000" : "#474747"} strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="3" stroke={active ? "#000" : "#474747"} strokeWidth="1.5"/>
        <path d="M11 2v2M11 18v2M2 11h2M18 11h2M4.22 4.22l1.42 1.42M16.36 16.36l1.42 1.42M4.22 17.78l1.42-1.42M16.36 5.64l1.42-1.42" stroke={active ? "#000" : "#474747"} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-[#F3F3F4] z-50"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="max-w-lg mx-auto flex items-stretch">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-opacity",
                active ? "opacity-100" : "opacity-50 hover:opacity-75"
              )}
            >
              {item.icon(active)}
              <span
                className={clsx(
                  "text-[10px] tracking-wide",
                  active ? "font-semibold text-anthracite" : "font-light text-on-surface-variant"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
