import { requireAdmin } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const service = createServiceClient();
  const { data: run } = await service
    .from("galley_runs")
    .select("id, status, brief, published_galley_id, error, created_at")
    .eq("id", id)
    .single();

  if (!run) notFound();

  // Status-aware: bounce mid-flight runs to their current step.
  if (run.status === "candidates_pending" || run.status === "candidates_ready") {
    redirect(`/admin/campaign-studio/runs/${id}/curate-candidates`);
  }
  if (run.status === "images_pending" || run.status === "images_ready") {
    redirect(`/admin/campaign-studio/runs/${id}/curate-images`);
  }

  return (
    <div>
      <Link
        href="/admin/campaign-studio"
        className="text-xs font-light text-on-surface-variant"
      >
        ← Studio
      </Link>

      <h1 className="text-4xl font-thin text-anthracite mt-1 mb-1">
        {run.status === "published" ? "Published" : run.status === "failed" ? "Failed" : run.status}
      </h1>
      <p className="text-xs font-light text-on-surface-variant mb-6">
        {new Date(run.created_at as string).toLocaleString()}
      </p>

      {run.status === "published" && run.published_galley_id && (
        <Link
          href={`/galley/${run.published_galley_id}`}
          className="block border border-anthracite bg-anthracite text-white text-sm font-light py-3 rounded-full text-center mb-6"
        >
          View public galley →
        </Link>
      )}

      {run.error && (
        <div className="bg-white rounded-md p-4 shadow-ambient mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
            Error
          </p>
          <p className="text-xs font-light text-red-600">{run.error}</p>
        </div>
      )}

      <div className="bg-white rounded-md p-4 shadow-ambient">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
          Brief
        </p>
        <pre className="text-xs font-light text-on-surface-variant whitespace-pre-wrap">
          {JSON.stringify(run.brief, null, 2)}
        </pre>
      </div>
    </div>
  );
}
