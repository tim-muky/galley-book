import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { postPhotosToFacebookPage, FacebookApiError } from "@/lib/marketing/facebook";
import { tagOrganicPost } from "@/lib/marketing/creative-tagging";
import { NextResponse } from "next/server";

// Each photo upload + the feed post is a few seconds; allow the long budget.
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
    .select("id, carousel_paths, caption_de, caption_en, post_title, fb_status, fb_post_id")
    .eq("galley_id", run.published_galley_id)
    .maybeSingle();
  if (!dist) {
    return NextResponse.json(
      { error: "No assets generated yet — generate the carousel first" },
      { status: 400 },
    );
  }
  if (dist.fb_status === "published" && dist.fb_post_id) {
    return NextResponse.json({ ok: true, postId: dist.fb_post_id, alreadyPublished: true });
  }

  const paths = (dist.carousel_paths as string[]) ?? [];
  if (paths.length < 1) {
    return NextResponse.json({ error: "No carousel slides to post" }, { status: 400 });
  }
  const message = (locale === "en" ? dist.caption_en : dist.caption_de) ?? "";

  try {
    const { postId } = await postPhotosToFacebookPage({
      imageUrls: paths.map(publicUrl),
      message,
    });

    await service
      .from("galley_distributions")
      .update({ fb_post_id: postId, fb_status: "published", fb_error: null })
      .eq("id", dist.id);

    // Tag the organic post for the learning loop, same taxonomy as IG/TikTok.
    // Best-effort — never fails the post.
    await tagOrganicPost({
      igPostId: postId,
      distributionId: dist.id,
      galleyId: run.published_galley_id,
      language: locale,
      mediaFormat: "carousel",
      placement: "organic-facebook",
      postTitle: dist.post_title,
    }).catch(() => {});

    logger.info("campaign_studio.fb.post_succeeded", { runId: id, postId });
    return NextResponse.json({ ok: true, postId });
  } catch (err) {
    const message =
      err instanceof FacebookApiError
        ? `${err.message}${err.code ? ` (code ${err.code}${err.subcode ? `/${err.subcode}` : ""})` : ""}`
        : err instanceof Error
          ? err.message
          : "Unknown error";

    await service
      .from("galley_distributions")
      .update({ fb_status: "failed", fb_error: message })
      .eq("id", dist.id);

    logger.error("campaign_studio.fb.post_failed", { runId: id, message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
