import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";

// Take a published campaign's landing page offline. The public galley is
// unpublished (is_public=false) so /galley/[id] stops resolving, and active
// distributions are dropped. The run record is kept (marked offline in brief)
// for history. For prompt-created galleys the caller may also request deletion
// of the generated galley + its recipes; imported user galleys are never
// deleted.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const service = createServiceClient();
  const BUCKET = "recipe-photos";

  const body = (await request.json().catch(() => ({}))) as {
    deleteGalley?: boolean;
  };

  const { data: run } = await service
    .from("galley_runs")
    .select("status, brief, published_galley_id")
    .eq("id", id)
    .single();
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const galleyId = run.published_galley_id as string | null;
  const brief = (run.brief ?? {}) as Record<string, unknown>;
  const imported = brief.imported === true;
  const alreadyOffline = brief.offline === true;

  if (run.status !== "published" || !galleyId) {
    return NextResponse.json(
      { error: "This run has no live landing page to take offline." },
      { status: 400 },
    );
  }
  if (alreadyOffline) {
    return NextResponse.json(
      { error: "This landing page is already offline." },
      { status: 400 },
    );
  }

  // Deletion is only ever offered for pipeline-generated galleys.
  const deleteGalley = body.deleteGalley === true && !imported;

  async function removeFolder(prefix: string) {
    const { data: files } = await service.storage.from(BUCKET).list(prefix);
    if (files && files.length > 0) {
      await service.storage.from(BUCKET).remove(files.map((f) => `${prefix}/${f.name}`));
    }
  }

  try {
    // Stop distribution regardless of whether the galley is deleted.
    await service.from("galley_distributions").delete().eq("galley_id", galleyId);

    if (deleteGalley) {
      await removeFolder(`campaign-assets/${galleyId}`);
      await removeFolder(`campaign-assets/import/${galleyId}`);
      // Cascades recipes, photos. This permanently removes the landing page.
      const { error: delErr } = await service.from("galleys").delete().eq("id", galleyId);
      if (delErr) throw new Error(`galley delete: ${delErr.message}`);
    } else if (!imported) {
      // Pipeline-generated galley — unpublish it so the landing page stops
      // resolving. Imported galleys belong to a real user, so we leave their
      // public visibility untouched and only drop the campaign distribution.
      const { error: pubErr } = await service
        .from("galleys")
        .update({ is_public: false, public_since: null })
        .eq("id", galleyId);
      if (pubErr) throw new Error(`unpublish: ${pubErr.message}`);
    }

    const { error: runErr } = await service
      .from("galley_runs")
      .update({
        brief: {
          ...brief,
          offline: true,
          offline_at: new Date().toISOString(),
          galley_deleted: deleteGalley || undefined,
        },
        published_galley_id: deleteGalley ? null : galleyId,
      })
      .eq("id", id);
    if (runErr) throw new Error(`run update: ${runErr.message}`);

    logger.info("campaign_studio.run.offline", {
      runId: id,
      galleyId,
      deletedGalley: deleteGalley,
      imported,
    });
    return NextResponse.json({ ok: true, deletedGalley: deleteGalley });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("campaign_studio.run.offline_failed", { runId: id, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
