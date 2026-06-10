import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { expandRecipe, generateGalleyCoverImage } from "@/lib/marketing/generate-recipes";
import type { RunCandidateWithImage } from "@/app/admin/campaign-studio/runs/[id]/curate-images/curate-images-client";
import { NextResponse } from "next/server";
import sharp from "sharp";

// Expansion is ~3-5s per recipe; ~7-10 in parallel still bounded by
// model rate limits. Same long budget as image gen.
export const maxDuration = 300;

const BUCKET = "recipe-photos";

/**
 * Best-effort parse of "200 g" / "1 EL" / "1.5 cups" into { amount, unit }.
 * Falls back to amount=null, unit=<raw> when the format is ambiguous.
 */
function parseAmount(raw: string): { amount: number | null; unit: string | null } {
  const match = raw.trim().match(/^([\d.,]+)\s*(.*)$/);
  if (!match) return { amount: null, unit: raw.trim() || null };
  const amount = parseFloat(match[1].replace(",", "."));
  if (Number.isNaN(amount)) return { amount: null, unit: raw.trim() || null };
  return { amount, unit: match[2].trim() || null };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;
  const adminUser = guard.user;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const galleyNameOverride: string | undefined =
    typeof body?.galleyName === "string" && body.galleyName.trim()
      ? body.galleyName.trim().slice(0, 200)
      : undefined;
  const service = createServiceClient();

  const { data: run, error: fetchErr } = await service
    .from("galley_runs")
    .select("id, brief, candidates, created_by, status, published_galley_id")
    .eq("id", id)
    .single();
  if (fetchErr || !run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (run.status === "published" && run.published_galley_id) {
    return NextResponse.json({ ok: true, galleyId: run.published_galley_id });
  }

  const candidates = (run.candidates as RunCandidateWithImage[]) ?? [];
  const ready = candidates.filter(
    (c) => c.keep && c.name.trim() && c.oneLiner.trim() && c.imagePath,
  );
  if (ready.length < 3) {
    return NextResponse.json(
      { error: "Need at least 3 kept candidates with images" },
      { status: 400 },
    );
  }

  await service.from("galley_runs").update({ status: "expanding" }).eq("id", id);

  const brief = run.brief as {
    theme?: string;
    country?: string;
    style?: string;
    locale?: "en" | "de";
  };
  const weekStamp = isoWeekStamp(new Date());
  const galleyName =
    galleyNameOverride ||
    brief.theme ||
    [brief.country, brief.style].filter(Boolean).join(" · ") ||
    `Galley of the Week ${weekStamp}`;

  try {
    // 1) Create the public galley
    const { data: galley, error: galleyErr } = await service
      .from("galleys")
      .insert({
        // If the admin gave an explicit name we trust it as-is; otherwise
        // append the ISO week so auto-generated names stay distinct.
        name: galleyNameOverride
          ? galleyName
          : `${galleyName} — KW ${weekStamp}`,
        owner_id: run.created_by,
        is_public: true,
        is_system: false,
        public_since: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (galleyErr || !galley) throw new Error(`galley create: ${galleyErr?.message}`);

    // 1a) Generate the galley's own cover, in parallel with recipe expansion.
    // Best-effort: a cover failure must never sink the publish — the recipes
    // are the deliverable. Cropped to the 1200×400 header banner convention
    // (galley-headers/{id}.jpg) shared with the manual upload route.
    const coverDone = (async () => {
      try {
        const cover = await generateGalleyCoverImage(galleyName);
        const jpeg = await sharp(Buffer.from(cover.base64, "base64"))
          .resize(1200, 400, { fit: "cover", position: "center" })
          .jpeg({ quality: 85 })
          .toBuffer();
        const coverPath = `galley-headers/${galley.id}.jpg`;
        const { error: coverErr } = await service.storage
          .from(BUCKET)
          .upload(coverPath, jpeg, { contentType: "image/jpeg", upsert: true });
        if (coverErr) throw new Error(coverErr.message);
        await service
          .from("galleys")
          .update({ header_image_path: coverPath })
          .eq("id", galley.id);
      } catch (coverErr) {
        logger.error("campaign_studio.cover_failed", {
          runId: id,
          galleyId: galley.id,
          message: coverErr instanceof Error ? coverErr.message : String(coverErr),
        });
      }
    })();

    // 2) Expand + insert each recipe in parallel
    const created = await Promise.allSettled(
      ready.map(async (c) => {
        const full = await expandRecipe(
          { name: c.name, oneLiner: c.oneLiner },
          { locale: brief.locale ?? "en" },
        );

        const { data: recipe, error: recipeErr } = await service
          .from("recipes")
          .insert({
            galley_id: galley.id,
            name: c.name,
            description: c.oneLiner,
            servings: full.servings,
            prep_time: full.cookTimeMinutes,
            created_by: adminUser.id,
          })
          .select("id")
          .single();
        if (recipeErr || !recipe) throw new Error(`recipe: ${recipeErr?.message}`);

        // Copy generated image from galley-runs/ to {recipeId}/primary.png,
        // then register it in recipe_photos so in-app views (library, recipe
        // detail) show it — the public galley page reads {id}/primary.png by
        // convention, but the app reads the recipe_photos table.
        if (c.imagePath) {
          const { data: src } = await service.storage.from(BUCKET).download(c.imagePath);
          if (src) {
            const buf = await src.arrayBuffer();
            const storagePath = `${recipe.id}/primary.png`;
            await service.storage
              .from(BUCKET)
              .upload(storagePath, buf, {
                contentType: "image/png",
                upsert: true,
              });
            await service.from("recipe_photos").insert({
              recipe_id: recipe.id,
              storage_path: storagePath,
              is_primary: true,
              sort_order: 0,
            });
          }
        }

        // Ingredients
        if (full.ingredients.length > 0) {
          const rows = full.ingredients.map((ing, idx) => {
            const { amount, unit } = parseAmount(ing.amount);
            return {
              recipe_id: recipe.id,
              name: ing.name,
              amount,
              unit,
              sort_order: idx,
            };
          });
          await service.from("ingredients").insert(rows);
        }

        // Steps
        if (full.steps.length > 0) {
          const rows = full.steps.map((instruction, idx) => ({
            recipe_id: recipe.id,
            step_number: idx + 1,
            instruction,
          }));
          await service.from("preparation_steps").insert(rows);
        }

        return recipe.id;
      }),
    );

    const succeeded = created.filter((r) => r.status === "fulfilled").length;
    const failed = created.filter((r) => r.status === "rejected");

    if (succeeded === 0) {
      throw new Error(
        `All recipes failed: ${failed.map((f) => (f as PromiseRejectedResult).reason).join("; ")}`,
      );
    }

    // Settle the cover before publishing so header_image_path is in place
    // when the galley first goes live. (Self-contained — never throws.)
    await coverDone;

    await service
      .from("galley_runs")
      .update({
        status: "published",
        published_galley_id: galley.id,
      })
      .eq("id", id);

    logger.info("campaign_studio.published", {
      runId: id,
      galleyId: galley.id,
      recipeCount: succeeded,
      failedCount: failed.length,
    });

    return NextResponse.json({
      ok: true,
      galleyId: galley.id,
      recipeCount: succeeded,
      failedCount: failed.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await service
      .from("galley_runs")
      .update({ status: "failed", error: message })
      .eq("id", id);
    logger.error("campaign_studio.publish_failed", { runId: id, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** ISO week stamp like "2026-22" */
function isoWeekStamp(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-${String(weekNo).padStart(2, "0")}`;
}
