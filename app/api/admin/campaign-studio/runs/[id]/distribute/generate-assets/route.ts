import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { renderCarousel } from "@/lib/marketing/carousel";
import { generateAdCopy, generatePostTitle } from "@/lib/marketing/ad-copy";
import { generateHashtags, formatHashtags, type ContentType } from "@/lib/marketing/hashtags";
import type { RunCandidateWithImage } from "@/app/admin/campaign-studio/runs/[id]/curate-images/curate-images-client";
import { NextResponse } from "next/server";

// Carousel render is CPU-heavy (Satori + Resvg + sharp per slide, up to 10
// slides) plus an AI ad-copy call. Same long budget as image gen / publish.
export const maxDuration = 300;

const BUCKET = "recipe-photos";

function publicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** The one-word, ALL-CAPS comment trigger viewers type to get the recipe DMed. */
function commentTrigger(locale: "de" | "en"): string {
  return locale === "de" ? "REZEPT" : "RECIPE";
}

/** The DM auto-reply copy the admin pastes into ManyChat / IG auto-reply. */
function dmReply(locale: "de" | "en", galleyUrl: string): string {
  return locale === "de"
    ? `Hier ist dein Rezept 👉 ${galleyUrl}\n\nIn galleybook speicherst du jedes Rezept mit einem Tipp – auf iPhone, Android und im Web. 1,99 €/Monat.`
    : `Here's your recipe 👉 ${galleyUrl}\n\nIn galleybook you save any recipe in one tap – on iPhone, Android and the web. €1.99/month.`;
}

/** Map the run theme to a content type so hashtags can be tailored per post (GAL-449). */
function detectContentType(theme: string): ContentType {
  if (/gemüse der woche|veggie of the week/i.test(theme)) return "veggie";
  if (/beste gerichte aus|best dishes from/i.test(theme)) return "region";
  return "galley";
}

/**
 * Compose a default IG caption. The CTA is the comment → DM mechanic (GAL-433):
 * viewers comment the trigger word and an auto-reply DMs them the recipe link —
 * this out-converts "link in bio" and lifts reach via comments. `hashtags` is a
 * pre-formatted "#a #b" string built per-post by the AI hashtag generator
 * (GAL-449), with the long-tail-first static lists as fallback.
 */
function buildCaption(
  title: string,
  recipeNames: string[],
  hashtags: string,
  locale: "de" | "en",
  trigger: string,
): string {
  const intro =
    locale === "de"
      ? `${title} 🍳\n\nKommentiere ${trigger} und ich schicke dir das ganze Rezept per DM. 💌 Alle Rezepte in deiner eigenen galleybook-Sammlung – auf jedem Gerät.`
      : `${title} 🍳\n\nComment ${trigger} and I'll send you the full recipe by DM. 💌 Every recipe in your own galleybook collection – on any device.`;

  const list = recipeNames.slice(0, 5).map((n) => `• ${n}`).join("\n");
  return `${intro}\n\n${list}\n\n${hashtags}`;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;
  const adminUser = guard.user;

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
      existing?.post_title || (await generatePostTitle({ theme, recipeNames, locale, userId: adminUser.id }));

    // The galley's own generated header becomes the carousel cover hero.
    const { data: galley } = await service
      .from("galleys")
      .select("header_image_path")
      .eq("id", galleyId)
      .single();
    const headerImageUrl = galley?.header_image_path
      ? publicUrl(galley.header_image_path)
      : null;

    // 1) Render carousel slides (cover uses the post title + galley header)
    const slides = await renderCarousel({
      title: postTitle,
      locale,
      headerImageUrl,
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
    const adVariants = await generateAdCopy({ theme, recipeNames, locale, userId: adminUser.id });

    // 4) Default captions (DE + EN) with the comment → DM mechanic (GAL-433).
    //    Hashtags are tailored to this post by the AI generator (GAL-449), with
    //    the galley's own tags as the static fallback seed.
    const allTags = Array.from(new Set(kept.flatMap((c) => c.tags ?? [])));
    const contentType = detectContentType(theme);
    const [hashtagsDe, hashtagsEn] = await Promise.all([
      generateHashtags({ theme, recipeNames, contentType, locale: "de", userId: adminUser.id }, allTags),
      generateHashtags({ theme, recipeNames, contentType, locale: "en", userId: adminUser.id }, allTags),
    ]);
    const triggerDe = commentTrigger("de");
    const triggerEn = commentTrigger("en");
    const captionDe = buildCaption(postTitle, recipeNames, formatHashtags(hashtagsDe), "de", triggerDe);
    const captionEn = buildCaption(postTitle, recipeNames, formatHashtags(hashtagsEn), "en", triggerEn);
    const galleyUrl = `https://galleybook.com/galley/${galleyId}?utm_source=instagram&utm_medium=organic&utm_campaign=gotw`;

    // 5) Upsert the distribution row (one per galley)
    const payload = {
      galley_id: galleyId,
      run_id: id,
      carousel_paths: carouselPaths,
      ad_variants: adVariants,
      caption_de: captionDe,
      caption_en: captionEn,
      post_title: postTitle,
      comment_trigger: triggerDe,
      dm_reply_de: dmReply("de", galleyUrl),
      dm_reply_en: dmReply("en", galleyUrl),
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
