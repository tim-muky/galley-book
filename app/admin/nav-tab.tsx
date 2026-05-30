"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavTab({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  // Exact match for /admin, prefix match for sub-pages
  const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm transition-colors ${
        active
          ? "bg-surface-low text-anthracite font-semibold"
          : "text-on-surface-variant font-light hover:text-anthracite"
      }`}
    >
      {label}
    </Link>
  );
}
