import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export default async function CampaignStudioPage() {
  await requireAdmin();

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
        <div className="bg-white rounded-md px-4 py-6 shadow-ambient text-sm font-light text-on-surface-variant text-center">
          No runs yet. Start your first Galley of the Week above.
        </div>
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
