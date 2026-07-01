import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import {
  postCarouselToInstagram,
  InstagramApiError,
} from "@/lib/marketing/instagram";
import { tagOrganicPost } from "@/lib/marketing/creative-tagging";
import { NextResponse } from "next/server";

// Each carousel child container upload + status poll is a few seconds;
// a 10-item carousel can take a minute or two.
export const maxDuration = 300;

const BUCKET = "recipe-photos";

function publicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
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
    .select("id, carousel_paths, caption_de, caption_en, ig_status, ig_post_id, post_title")
    .eq("galley_id", run.published_galley_id)
    .maybeSingle();
  if (!dist) {
    return NextResponse.json(
      { error: "No assets generated yet — generate the carousel first" },
      { status: 400 },
    );
  }
  if (dist.ig_status === "published" && dist.ig_post_id) {
    return NextResponse.json({ ok: true, igPostId: dist.ig_post_id, alreadyPublished: true });
  }

  const paths = (dist.carousel_paths as string[]) ?? [];
  if (paths.length < 2) {
    return NextResponse.json({ error: "Carousel has fewer than 2 slides" }, { status: 400 });
  }
  const caption = (locale === "en" ? dist.caption_en : dist.caption_de) ?? "";

  try {
    const { igPostId } = await postCarouselToInstagram({
      imageUrls: paths.map(publicUrl),
      caption,
    });

    await service
      .from("galley_distributions")
      .update({
        ig_post_id: igPostId,
        ig_status: "published",
        ig_error: null,
        // Remember which caption language we posted so the comment → DM webhook
        // (app/api/webhooks/instagram) replies in the matching language.
        ig_posted_locale: locale,
      })
      .eq("id", dist.id);

    // Tag the organic post for the learning loop (GAL-436). Best-effort: the
    // default caption uses the comment → DM mechanic, so angle defaults to
    // "comment" / cta "comment-dm". Never fails the post.
    await tagOrganicPost({
      igPostId,
      distributionId: dist.id,
      galleyId: run.published_galley_id,
      language: locale,
      mediaFormat: "carousel",
      postTitle: dist.post_title,
    }).catch(() => {});

    logger.info("campaign_studio.ig.post_succeeded", { runId: id, igPostId });
    return NextResponse.json({ ok: true, igPostId });
  } catch (err) {
    const message =
      err instanceof InstagramApiError
        ? `${err.message}${err.code ? ` (code ${err.code}${err.subcode ? `/${err.subcode}` : ""})` : ""}`
        : err instanceof Error
          ? err.message
          : "Unknown error";

    await service
      .from("galley_distributions")
      .update({ ig_status: "failed", ig_error: message })
      .eq("id", dist.id);

    logger.error("campaign_studio.ig.post_failed", { runId: id, message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
