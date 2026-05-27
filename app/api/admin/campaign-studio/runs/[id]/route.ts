import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const service = createServiceClient();
  const { data, error } = await service
    .from("galley_runs")
    .select("id, status, brief, candidates, published_galley_id, error, updated_at")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const service = createServiceClient();

  // Only let unpublished runs be deleted from the UI — published galleys are
  // real artifacts and shouldn't disappear by accident.
  const { data: run } = await service
    .from("galley_runs")
    .select("status")
    .eq("id", id)
    .single();
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (run.status === "published") {
    return NextResponse.json(
      { error: "Cannot delete a published run — delete the public galley first if you want to remove it." },
      { status: 400 },
    );
  }

  const { error } = await service.from("galley_runs").delete().eq("id", id);
  if (error) {
    logger.error("campaign_studio.run.delete_failed", { runId: id, message: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
