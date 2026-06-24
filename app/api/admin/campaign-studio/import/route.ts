import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { generateRecipeImage } from "@/lib/marketing/generate-recipes";
import type { RunCandidateWithImage } from "@/app/admin/campaign-studio/runs/[id]/curate-images/curate-images-client";
import { NextResponse } from "next/server";
import { z } from "zod";

// Watercolor mode generates an image per recipe (~5-10s each), sequential to
// respect model rate limits. Same long budget as the other gen routes.
export const maxDuration = 300;

const BUCKET = "recipe-photos";

const ImportSchema = z.object({
  galleyId: z.string().uuid(),
  recipeIds: z.array(z.string().uuid()).min(2),
  imageMode: z.enum(["keep", "watercolor"]),
  title: z.string().max(200).optional(),
});

/**
 * Import an existing public galley into Campaign Studio (GAL-401).
 *
 * Rather than a separate distribution surface, we create a lightweight
 * "published" galley_run pointing at the existing galley, with candidates built
 * from the selected recipes — so the existing run-centric Distribute flow
 * (carousel → IG → Meta) is reused unchanged. The source galley is never
 * mutated; watercolor images are generated only for the marketing assets.
 */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;
  const adminUser = guard.user;

  const parsed = ImportSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { galleyId, recipeIds, imageMode, title } = parsed.data;
  const service = createServiceClient();

  // Galley must exist and be public.
  const { data: galley } = await service
    .from("galleys")
    .select("id, name, is_public")
    .eq("id", galleyId)
    .single();
  if (!galley) return NextResponse.json({ error: "Galley not found" }, { status: 404 });
  if (!galley.is_public) {
    return NextResponse.json({ error: "Galley is not public" }, { status: 400 });
  }

  // Selected recipes + their primary photos.
  const [{ data: recipes }, { data: photos }] = await Promise.all([
    service
      .from("recipes")
      .select("id, name, description")
      .eq("galley_id", galleyId)
      .in("id", recipeIds)
      .is("deleted_at", null),
    service
      .from("recipe_photos")
      .select("recipe_id, storage_path, is_primary")
      .in("recipe_id", recipeIds),
  ]);
  if (!recipes || recipes.length < 2) {
    return NextResponse.json({ error: "Need at least 2 valid recipes" }, { status: 400 });
  }

  const primaryPath = (recipeId: string): string | null => {
    const forRecipe = (photos ?? []).filter((p) => p.recipe_id === recipeId);
    return (forRecipe.find((p) => p.is_primary) ?? forRecipe[0])?.storage_path ?? null;
  };

  try {
    // Honor the admin's chosen order (= carousel slide order), not DB order.
    const byId = new Map(recipes.map((r) => [r.id as string, r]));
    const ordered = recipeIds
      .map((rid) => byId.get(rid))
      .filter((r): r is (typeof recipes)[number] => Boolean(r));

    const candidates: RunCandidateWithImage[] = [];
    for (const r of ordered) {
      const oneLiner = (r.description as string | null)?.trim() || r.name;
      // Keep mode uses the existing photo; watercolor mode (or a keep-mode recipe
      // with no photo) generates one — so a selected recipe is never dropped.
      const existingPhoto = imageMode === "keep" ? primaryPath(r.id) : null;
      let imagePath: string;

      if (existingPhoto) {
        imagePath = existingPhoto;
      } else {
        const img = await generateRecipeImage({ name: r.name, oneLiner }, { userId: adminUser.id });
        const path = `campaign-assets/import/${galleyId}/${r.id}.png`;
        const buf = Buffer.from(img.base64, "base64");
        const { error: upErr } = await service.storage
          .from(BUCKET)
          .upload(path, buf, { contentType: img.mediaType, upsert: true });
        if (upErr) throw new Error(`watercolor upload (${r.id}): ${upErr.message}`);
        imagePath = path;
      }

      candidates.push({ name: r.name, oneLiner, tags: [], keep: true, imagePath });
    }

    if (candidates.length < 2) {
      return NextResponse.json({ error: "Need at least 2 recipes" }, { status: 400 });
    }

    // Lightweight "published" run pointing at the existing galley → reuses the
    // Distribute flow. Not mutating the galley itself.
    const { data: run, error: runErr } = await service
      .from("galley_runs")
      .insert({
        created_by: adminUser.id,
        status: "published",
        published_galley_id: galleyId,
        brief: { theme: title?.trim() || (galley.name as string), locale: "de", imported: true },
        candidates,
      })
      .select("id")
      .single();
    if (runErr || !run) throw new Error(`run create: ${runErr?.message}`);

    logger.info("campaign_studio.imported", {
      galleyId,
      runId: run.id,
      recipeCount: candidates.length,
      imageMode,
    });
    return NextResponse.json({ ok: true, runId: run.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("campaign_studio.import_failed", { galleyId, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
