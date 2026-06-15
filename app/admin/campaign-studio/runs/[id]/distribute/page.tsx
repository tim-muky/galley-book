import { requireAdmin } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { notFound, redirect } from "next/navigation";
import { DistributeClient } from "./distribute-client";

export const dynamic = "force-dynamic";

export default async function DistributePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ channels?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { channels } = await searchParams;
  // Channels chosen on the published-run screen (GAL-456). Empty/absent → show all.
  const selectedChannels = channels
    ? channels.split(",").map((c) => c.trim()).filter(Boolean)
    : null;

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
      channels={selectedChannels}
    />
  );
}
