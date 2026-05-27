import { requireAdmin } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CurateCandidatesClient, type RunCandidate } from "./curate-client";

export const dynamic = "force-dynamic";

export default async function CurateCandidatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const service = createServiceClient();
  const { data: run } = await service
    .from("galley_runs")
    .select("id, status, brief, candidates")
    .eq("id", id)
    .single();

  if (!run) notFound();

  // Status-aware routing — bounce to the right step if we're past curation.
  if (run.status === "images_ready" || run.status === "images_pending") {
    redirect(`/admin/campaign-studio/runs/${id}/curate-images`);
  }
  if (run.status === "published") {
    redirect(`/admin/campaign-studio/runs/${id}`);
  }

  const candidates = (run.candidates as RunCandidate[]) ?? [];

  return (
    <div>
      <Link
        href="/admin/campaign-studio"
        className="text-xs font-light text-on-surface-variant"
      >
        ← Studio
      </Link>
      <h1 className="text-4xl font-thin text-anthracite mt-1 mb-1">
        Curate candidates
      </h1>
      <p className="text-xs font-light text-on-surface-variant mb-6">
        Step 1 of 2 · Keep the ones you want, edit names or one-liners, then
        generate watercolor images.
      </p>

      <CurateCandidatesClient runId={id} initialCandidates={candidates} />
    </div>
  );
}
