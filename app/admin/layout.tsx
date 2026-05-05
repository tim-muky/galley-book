import Link from "next/link";
import { NavTab } from "./nav-tab";
import { requireAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

const NAV_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/ai-cost", label: "AI Cost" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/import-test", label: "Import Test" },
  { href: "/admin/parse-logs", label: "Parse Logs" },
  { href: "/admin/comp", label: "Comp" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-surface">
      {/* Top bar */}
      <header className="bg-white shadow-ambient px-5 pt-safe-top">
        <div className="max-w-4xl mx-auto flex items-end justify-between pt-4 pb-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
            Admin
          </span>
          <Link
            href="/library"
            className="text-xs font-light text-on-surface-variant"
          >
            ← App
          </Link>
        </div>

        {/* Nav tabs */}
        <div className="max-w-4xl mx-auto flex gap-5 overflow-x-auto pb-0 scrollbar-hide">
          {NAV_LINKS.map(({ href, label }) => (
            <NavTab key={href} href={href} label={label} />
          ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-6">{children}</main>
    </div>
  );
}
