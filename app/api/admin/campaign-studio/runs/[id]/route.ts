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
  const BUCKET = "recipe-photos";

  const { data: run } = await service
    .from("galley_runs")
    .select("status, brief, published_galley_id")
    .eq("id", id)
    .single();
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Best-effort cleanup of generated campaign assets in storage.
  async function removeFolder(prefix: string) {
    const { data: files } = await service.storage.from(BUCKET).list(prefix);
    if (files && files.length > 0) {
      await service.storage.from(BUCKET).remove(files.map((f) => `${prefix}/${f.name}`));
    }
  }

  const galleyId = run.published_galley_id as string | null;
  const imported = (run.brief as { imported?: boolean } | null)?.imported === true;

  try {
    if (run.status === "published" && galleyId) {
      await removeFolder(`campaign-assets/${galleyId}`);
      await removeFolder(`campaign-assets/import/${galleyId}`);

      if (imported) {
        // Imported galley belongs to a user — keep it; just drop the campaign.
        await service.from("galley_distributions").delete().eq("galley_id", galleyId);
      } else {
        // Pipeline-generated test galley — remove it (cascades recipes, photos,
        // distribution). This deletes the public landing page.
        await service.from("galleys").delete().eq("id", galleyId);
      }
    }

    const { error } = await service.from("galley_runs").delete().eq("id", id);
    if (error) throw new Error(error.message);

    logger.info("campaign_studio.run.deleted", { runId: id, published: run.status === "published", imported });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("campaign_studio.run.delete_failed", { runId: id, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
