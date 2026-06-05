import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { renderCarousel } from "@/lib/marketing/carousel";
import { generateAdCopy, generatePostTitle } from "@/lib/marketing/ad-copy";
import type { RunCandidateWithImage } from "@/app/admin/campaign-studio/runs/[id]/curate-images/curate-images-client";
import { NextResponse } from "next/server";

// Carousel render is CPU-heavy (Satori + Resvg + sharp per slide, up to 10
// slides) plus an AI ad-copy call. Same long budget as image gen / publish.
export const maxDuration = 300;

const BUCKET = "recipe-photos";

function publicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** Compose a default IG caption + hashtags from the post title and candidate tags. */
function buildCaption(
  title: string,
  recipeNames: string[],
  tags: string[],
  locale: "de" | "en",
): string {
  // Long-tail-first, mirroring the ASO strategy: a new, low-authority account
  // can't surface on saturated head hashtags. Lead with the galley's own
  // (already topical) tags + broadly-safe niche/occasion tags; keep only a few
  // head terms, last, so they drop first when we hit the 12-tag cap. Niche tags
  // are occasion/use-case (safe on any galley) — diet specificity comes from the
  // galley's own tags, so we never put #vegan on a steak galley.
  const niche =
    locale === "de"
      ? ["mealprepdeutsch", "schnellerezepte", "familienrezepte", "wochenplan", "einfacherezepte"]
      : ["mealprepideas", "easyrecipes", "familymeals", "weeklymealplan", "quickrecipes"];
  const head = locale === "de" ? ["rezepte", "kochen", "mealprep"] : ["recipes", "cooking", "mealprep"];
  const galleyTags = tags.map((t) => t.replace(/[^a-z0-9]/gi, "").toLowerCase()).filter(Boolean);
  const hashtags = Array.from(new Set(["galleybook", ...galleyTags, ...niche, ...head]))
    .slice(0, 12)
    .map((t) => `#${t}`)
    .join(" ");

  const intro =
    locale === "de"
      ? `${title} 🍳\n\nDiese Rezepte – plus den Rest – speicherst du mit einem Tipp in deine eigene galleybook-Sammlung. Link in Bio.`
      : `${title} 🍳\n\nSave these — and the rest — to your own galleybook collection in one tap. Link in bio.`;

  const list = recipeNames.slice(0, 5).map((n) => `• ${n}`).join("\n");
  return `${intro}\n\n${list}\n\n${hashtags}`;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const service = createServiceClient();

  const { data: run, error: fetchErr } = await service
    .from("galley_runs")
    .select("id, brief, candidates, status, published_galley_id")
    .eq("id", id)
    .single();
  if (fetchErr || !run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (run.status !== "published" || !run.published_galley_id) {
    return NextResponse.json(
      { error: "Run must be published before generating distribution assets" },
      { status: 400 },
    );
  }

  const galleyId = run.published_galley_id;
  const brief = run.brief as { theme?: string; country?: string; style?: string; locale?: "en" | "de" };
  const locale = brief.locale ?? "de";
  const theme =
    brief.theme || [brief.country, brief.style].filter(Boolean).join(" · ") || "Galley of the Week";

  const candidates = (run.candidates as RunCandidateWithImage[]) ?? [];
  const kept = candidates.filter((c) => c.keep && c.name.trim() && c.oneLiner.trim() && c.imagePath);
  if (kept.length < 2) {
    return NextResponse.json(
      { error: "Need at least 2 kept recipes with images to build a carousel" },
      { status: 400 },
    );
  }

  try {
    // Reuse an admin-edited title across regenerations; else a catchy default.
    const recipeNames = kept.map((c) => c.name);
    const { data: existing } = await service
      .from("galley_distributions")
      .select("id, post_title")
      .eq("galley_id", galleyId)
      .maybeSingle();
    const postTitle =
      existing?.post_title || (await generatePostTitle({ theme, recipeNames, locale }));

    // 1) Render carousel slides (cover uses the post title)
    const slides = await renderCarousel({
      title: postTitle,
      locale,
      recipes: kept.map((c) => ({
        name: c.name,
        oneLiner: c.oneLiner,
        imageUrl: publicUrl(c.imagePath as string),
      })),
    });

    // 2) Upload slides to public storage under campaign-assets/<galleyId>/
    const carouselPaths: string[] = [];
    for (let i = 0; i < slides.length; i++) {
      const path = `campaign-assets/${galleyId}/slide-${i}.jpg`;
      const { error: upErr } = await service.storage
        .from(BUCKET)
        .upload(path, slides[i], { contentType: "image/jpeg", upsert: true });
      if (upErr) throw new Error(`slide ${i} upload: ${upErr.message}`);
      carouselPaths.push(path);
    }

    // 3) Generate ad-copy variants (quick single call)
    const adVariants = await generateAdCopy({ theme, recipeNames, locale });

    // 4) Default captions (DE + EN) — opener uses the post title
    const allTags = Array.from(new Set(kept.flatMap((c) => c.tags ?? [])));
    const captionDe = buildCaption(postTitle, recipeNames, allTags, "de");
    const captionEn = buildCaption(postTitle, recipeNames, allTags, "en");

    // 5) Upsert the distribution row (one per galley)
    const payload = {
      galley_id: galleyId,
      run_id: id,
      carousel_paths: carouselPaths,
      ad_variants: adVariants,
      caption_de: captionDe,
      caption_en: captionEn,
      post_title: postTitle,
    };

    const { data: distribution, error: writeErr } = existing
      ? await service
          .from("galley_distributions")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single()
      : await service.from("galley_distributions").insert(payload).select().single();

    if (writeErr || !distribution) {
      throw new Error(`persist distribution: ${writeErr?.message}`);
    }

    logger.info("campaign_studio.assets.generated", {
      runId: id,
      galleyId,
      slideCount: carouselPaths.length,
      adVariantCount: adVariants.length,
    });

    return NextResponse.json({ ok: true, distribution });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("campaign_studio.assets.failed", { runId: id, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
