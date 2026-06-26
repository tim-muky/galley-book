"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = { href: string; label: string };

export function AdminNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  // Active = the tab whose href is the LONGEST prefix of the current path, so a
  // child route (e.g. campaign-studio/dashboard) doesn't also light its parent.
  const activeHref = links
    .filter((l) =>
      l.href === "/admin"
        ? pathname === "/admin"
        : pathname === l.href || pathname.startsWith(l.href + "/"),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="max-w-4xl mx-auto flex gap-5 overflow-x-auto pb-0 scrollbar-hide">
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm transition-colors ${
            href === activeHref
              ? "bg-surface-low text-anthracite font-semibold"
              : "text-on-surface-variant font-light hover:text-anthracite"
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
