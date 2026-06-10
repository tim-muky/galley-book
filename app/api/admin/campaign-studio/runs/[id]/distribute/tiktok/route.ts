import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { postPhotosToTikTok, TikTokApiError } from "@/lib/marketing/tiktok";
import { tagOrganicPost } from "@/lib/marketing/creative-tagging";
import { NextResponse } from "next/server";

// PULL_FROM_URL fetch + status polling can take a minute or two.
export const maxDuration = 300;

/**
 * Base for the public slide proxy. Must be a domain verified in the TikTok
 * developer portal (TikTok only accepts PULL_FROM_URL images on a verified
 * domain). Defaults to the marketing host; override per-env if needed.
 */
function assetBase(): string {
  return (process.env.TIKTOK_ASSET_BASE_URL || "https://galleybook.com").replace(/\/$/, "");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const locale: "de" | "en" = body?.locale === "en" ? "en" : "de";

  const service = createServiceClient();

  const { data: run } = await service
    .from("galley_runs")
    .select("published_galley_id")
    .eq("id", id)
    .single();
  if (!run?.published_galley_id) {
    return NextResponse.json({ error: "Run not published" }, { status: 400 });
  }

  const { data: dist } = await service
    .from("galley_distributions")
    .select("id, carousel_paths, caption_de, caption_en, post_title, tiktok_status, tiktok_post_id")
    .eq("galley_id", run.published_galley_id)
    .maybeSingle();
  if (!dist) {
    return NextResponse.json(
      { error: "No assets generated yet — generate the carousel first" },
      { status: 400 },
    );
  }
  if (dist.tiktok_status === "published" && dist.tiktok_post_id) {
    return NextResponse.json({ ok: true, publishId: dist.tiktok_post_id, alreadyPublished: true });
  }

  const paths = (dist.carousel_paths as string[]) ?? [];
  if (paths.length < 1) {
    return NextResponse.json({ error: "No carousel slides to post" }, { status: 400 });
  }
  // Slides are named slide-{i}.jpg; serve each through the public proxy on our
  // verified domain so TikTok's PULL_FROM_URL accepts them.
  const base = assetBase();
  const imageUrls = paths.map(
    (_, i) => `${base}/api/public/campaign-slide/${run.published_galley_id}/${i}`,
  );
  const description = (locale === "en" ? dist.caption_en : dist.caption_de) ?? "";
  const title = dist.post_title ?? "galleybook";

  try {
    const { publishId, status, privacy } = await postPhotosToTikTok({
      imageUrls,
      title,
      description,
    });

    await service
      .from("galley_distributions")
      .update({ tiktok_post_id: publishId, tiktok_status: "published", tiktok_error: null })
      .eq("id", dist.id);

    // Tag the organic post for the learning loop, same taxonomy as IG. The
    // default caption uses the comment → DM mechanic. Best-effort.
    await tagOrganicPost({
      igPostId: publishId,
      distributionId: dist.id,
      galleyId: run.published_galley_id,
      language: locale,
      mediaFormat: "carousel",
      placement: "organic-tiktok",
      postTitle: dist.post_title,
    }).catch(() => {});

    logger.info("campaign_studio.tiktok.post_succeeded", { runId: id, publishId, status, privacy });
    return NextResponse.json({ ok: true, publishId, status, privacy });
  } catch (err) {
    const message =
      err instanceof TikTokApiError
        ? `${err.message}${err.code ? ` (${err.code})` : ""}`
        : err instanceof Error
          ? err.message
          : "Unknown error";

    await service
      .from("galley_distributions")
      .update({ tiktok_status: "failed", tiktok_error: message })
      .eq("id", dist.id);

    logger.error("campaign_studio.tiktok.post_failed", { runId: id, message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
