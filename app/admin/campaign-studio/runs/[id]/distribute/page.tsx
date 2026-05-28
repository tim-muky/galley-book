import { requireAdmin } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { notFound, redirect } from "next/navigation";
import { DistributeClient } from "./distribute-client";

export const dynamic = "force-dynamic";

export default async function DistributePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const service = createServiceClient();
  const { data: run } = await service
    .from("galley_runs")
    .select("id, status, published_galley_id")
    .eq("id", id)
    .single();

  if (!run) notFound();
  if (run.status !== "published" || !run.published_galley_id) {
    // Only published runs can be distributed.
    redirect(`/admin/campaign-studio/runs/${id}`);
  }

  const [{ data: galley }, { data: distribution }] = await Promise.all([
    service.from("galleys").select("name").eq("id", run.published_galley_id).single(),
    service
      .from("galley_distributions")
      .select("*")
      .eq("galley_id", run.published_galley_id)
      .maybeSingle(),
  ]);

  return (
    <DistributeClient
      runId={id}
      galleyId={run.published_galley_id}
      galleyName={(galley?.name as string) ?? ""}
      initialDistribution={distribution}
    />
  );
}
