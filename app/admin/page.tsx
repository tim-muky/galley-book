import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";

export default async function AdminOverviewPage() {
  await requireAdmin();
  const service = createServiceClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: totalUsers },
    { data: recentRecipeUsers },
    { data: recentVoteUsers },
    { count: totalRecipes },
    { count: recipesThisWeek },
    { data: aiThisMonth },
    { data: aiAllTime },
  ] = await Promise.all([
    service.from("users").select("*", { count: "exact", head: true }),
    service.from("recipes").select("created_by").gte("created_at", weekAgo).not("created_by", "is", null),
    service.from("votes").select("user_id").gte("created_at", weekAgo),
    service.from("recipes").select("*", { count: "exact", head: true }).is("deleted_at", null),
    service.from("recipes").select("*", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", weekAgo),
    service.from("ai_usage_logs").select("cost_usd, operation").gte("created_at", monthStart),
    service.from("ai_usage_logs").select("cost_usd"),
  ]);

  const activeIds = new Set([
    ...(recentRecipeUsers ?? []).map((r) => r.created_by as string),
    ...(recentVoteUsers ?? []).map((r) => r.user_id as string),
  ]);
  const activeUsersThisWeek = activeIds.size;

  const aiCallsThisMonth = aiThisMonth?.length ?? 0;
  const aiCostThisMonth = (aiThisMonth ?? []).reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
  const aiCostAllTime = (aiAllTime ?? []).reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);

  const monthName = now.toLocaleString("en", { month: "long" });

  return (
    <div>
      <h1 className="text-4xl font-thin text-anthracite mb-1">Overview</h1>
      <p className="text-xs font-light text-on-surface-variant mb-8">
        {now.toLocaleDateString("en", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
      </p>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <StatCard
          label="Users"
          value={totalUsers ?? 0}
          sub={`${activeUsersThisWeek} active this week`}
        />
        <StatCard
          label="Recipes"
          value={totalRecipes ?? 0}
          sub={`+${recipesThisWeek ?? 0} this week`}
        />
        <StatCard
          label={`AI cost — ${monthName}`}
          value={`$${aiCostThisMonth.toFixed(4)}`}
          sub={`${aiCallsThisMonth} calls`}
        />
        <StatCard
          label="AI cost — all time"
          value={`$${aiCostAllTime.toFixed(4)}`}
          sub={`${aiAllTime?.length ?? 0} total calls`}
        />
      </div>

      <div className="flex flex-col gap-3">
        <SectionLink href="/admin/ai-cost" label="AI Cost breakdown" />
        <SectionLink href="/admin/users" label="User activity" />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="bg-white rounded-md p-4 shadow-ambient">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
        {label}
      </p>
      <p className="text-3xl font-thin text-anthracite leading-none mb-1">{value}</p>
      <p className="text-xs font-light text-on-surface-variant">{sub}</p>
    </div>
  );
}

function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between bg-white rounded-md px-4 py-3 shadow-ambient text-sm font-light text-anthracite"
    >
      {label}
      <span className="text-on-surface-variant">→</span>
    </Link>
  );
}
