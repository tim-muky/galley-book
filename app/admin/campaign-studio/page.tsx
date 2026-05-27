import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  candidates_pending: "Generating candidates",
  candidates_ready: "Curate candidates",
  images_pending: "Generating images",
  images_ready: "Curate images",
  expanding: "Expanding recipes",
  published: "Published",
  failed: "Failed",
};

export default async function CampaignStudioPage() {
  await requireAdmin();
  const service = createServiceClient();

  const { data: runs } = await service
    .from("galley_runs")
    .select("id, status, brief, created_at, published_galley_id")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div>
      <h1 className="text-4xl font-thin text-anthracite mb-1">Campaign Studio</h1>
      <p className="text-xs font-light text-on-surface-variant mb-8">
        Galley of the Week pipeline · IG distribution · Meta Ads control
      </p>

      <div className="flex flex-col gap-3 mb-8">
        <Link
          href="/admin/campaign-studio/new"
          className="border border-anthracite bg-anthracite text-white rounded-full px-5 py-3 text-sm font-light text-center"
        >
          + New Galley of the Week
        </Link>
      </div>

      <section className="mb-8">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-3">
          Runs
        </h2>
        {runs && runs.length > 0 ? (
          <div className="flex flex-col gap-2">
            {runs.map((r) => {
              const brief = (r.brief ?? {}) as { country?: string; style?: string };
              const title =
                [brief.country, brief.style].filter(Boolean).join(" · ") ||
                "Untitled brief";
              return (
                <Link
                  key={r.id}
                  href={`/admin/campaign-studio/runs/${r.id}`}
                  className="bg-white rounded-md px-4 py-3 shadow-ambient flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-light text-anthracite truncate">{title}</p>
                    <p className="text-[10px] font-light text-on-surface-variant">
                      {new Date(r.created_at as string).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant shrink-0 ml-3">
                    {STATUS_LABEL[r.status as string] ?? r.status}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-md px-4 py-6 shadow-ambient text-sm font-light text-on-surface-variant text-center">
            No runs yet. Start your first Galley of the Week above.
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-3">
          Distribution
        </h2>
        <div className="bg-white rounded-md px-4 py-6 shadow-ambient text-sm font-light text-on-surface-variant text-center">
          Attribution dashboard arrives with the first published galley.
        </div>
      </section>
    </div>
  );
}
