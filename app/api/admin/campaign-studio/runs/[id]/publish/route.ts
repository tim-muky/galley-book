import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { sendPushToUsers } from "@/lib/push/send";
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
  // The stored, user-visible name: auto-generated names get the ISO week
  // appended to stay distinct; an explicit override is trusted as-is. Reused
  // for the "new public galley" push so the copy matches what users see.
  const galleyDisplayName = galleyNameOverride
    ? galleyName
    : `${galleyName} — KW ${weekStamp}`;

  try {
    // 1) Create the public galley
    const { data: galley, error: galleyErr } = await service
      .from("galleys")
      .insert({
        // If the admin gave an explicit name we trust it as-is; otherwise
        // append the ISO week so auto-generated names stay distinct.
        name: galleyDisplayName,
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
        const cover = await generateGalleyCoverImage(galleyName, { userId: adminUser.id });
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
          { locale: brief.locale ?? "de", userId: adminUser.id },
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

    // Notify the whole user base that a fresh public galley is live. Campaign
    // Studio is the only path that reaches this route, so the push is inherently
    // scoped to studio galleys — a user flipping their own galley public from
    // Settings never lands here. Localized DE/EN by the recipient's
    // preferred_language; opt-outs + dead-token pruning are handled inside
    // sendPushToUsers. Awaited (unlike the user-facing routes' fire-and-forget):
    // the publish is already a long admin operation, so we'd rather guarantee
    // delivery than save a few hundred ms. A push failure is logged and never
    // fails the publish — the galley is already live at this point.
    try {
      const { data: deviceRows } = await service
        .from("user_devices")
        .select("user_id");
      const userIds = Array.from(
        new Set((deviceRows ?? []).map((d) => d.user_id)),
      ).filter((uid) => uid !== adminUser.id);

      if (userIds.length > 0) {
        const { data: userRows } = await service
          .from("users")
          .select("id, preferred_language")
          .in("id", userIds);
        const prefersDe = new Map(
          (userRows ?? []).map((u) => [
            u.id,
            (u.preferred_language ?? "").toLowerCase().startsWith("de"),
          ]),
        );

        const buckets: Record<"de" | "en", string[]> = { de: [], en: [] };
        for (const uid of userIds) {
          buckets[prefersDe.get(uid) ? "de" : "en"].push(uid);
        }

        const copy = {
          en: {
            title: "A new galley just dropped",
            body: `${galleyDisplayName} is live — tap to explore this week's recipes.`,
          },
          de: {
            title: "Neue Galley ist da",
            body: `${galleyDisplayName} ist online — tipp rein und entdecke die Rezepte der Woche.`,
          },
        } as const;

        for (const lang of ["de", "en"] as const) {
          if (buckets[lang].length === 0) continue;
          await sendPushToUsers(buckets[lang], {
            eventType: "public_galley_published",
            title: copy[lang].title,
            body: copy[lang].body,
            data: {
              screen: "public_galley",
              galleyId: galley.id,
              galleyName: galleyDisplayName,
            },
          });
        }
      }
    } catch (pushErr) {
      logger.error("campaign_studio.public_galley_push_failed", {
        runId: id,
        galleyId: galley.id,
        message: pushErr instanceof Error ? pushErr.message : String(pushErr),
      });
    }

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
