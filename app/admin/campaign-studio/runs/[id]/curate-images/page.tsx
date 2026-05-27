import { requireAdmin } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CurateImagesClient, type RunCandidateWithImage } from "./curate-images-client";

export const dynamic = "force-dynamic";

export default async function CurateImagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const service = createServiceClient();
  const { data: run } = await service
    .from("galley_runs")
    .select("id, status, candidates")
    .eq("id", id)
    .single();
  if (!run) notFound();

  if (run.status === "candidates_ready" || run.status === "candidates_pending") {
    redirect(`/admin/campaign-studio/runs/${id}/curate-candidates`);
  }
  if (run.status === "published") {
    redirect(`/admin/campaign-studio/runs/${id}`);
  }

  const candidates = (run.candidates as RunCandidateWithImage[]) ?? [];

  return (
    <div>
      <Link
        href={`/admin/campaign-studio/runs/${id}/curate-candidates`}
        className="text-xs font-light text-on-surface-variant"
      >
        ← Candidates
      </Link>
      <h1 className="text-4xl font-thin text-anthracite mt-1 mb-1">
        Curate images
      </h1>
      <p className="text-xs font-light text-on-surface-variant mb-6">
        Step 2 of 2 · Regenerate any image you don't like, then publish the galley.
      </p>

      <CurateImagesClient runId={id} initialCandidates={candidates} runStatus={run.status as string} />
    </div>
  );
}
