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
      className={`flex-shrink-0 pb-3 text-sm border-b-2 transition-colors ${
        active
          ? "border-anthracite text-anthracite font-semibold"
          : "border-transparent text-on-surface-variant font-light"
      }`}
    >
      {label}
    </Link>
  );
}
