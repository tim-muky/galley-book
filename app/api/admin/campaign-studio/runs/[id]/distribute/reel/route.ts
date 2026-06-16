import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { renderReelVideo } from "@/lib/marketing/reel-video";
import { postReelToInstagram, InstagramApiError } from "@/lib/marketing/instagram";
import { tagOrganicPost } from "@/lib/marketing/creative-tagging";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

// Rendering (download + sharp pad per slide + ffmpeg) plus the Reels transcode
// poll on publish both need the long budget.
export const maxDuration = 300;

const BUCKET = "recipe-photos";

function publicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** Pick a random licensed track from public/audio, or null to render silent. */
async function pickAudioFile(): Promise<string | null> {
  const dir = join(process.cwd(), "public", "audio");
  try {
    const mp3s = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".mp3"));
    if (!mp3s.length) return null;
    return join(dir, mp3s[Math.floor(Math.random() * mp3s.length)]);
  } catch {
    return null;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action: "render" | "publish" = body?.action === "publish" ? "publish" : "render";
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
  const galleyId = run.published_galley_id;

  const { data: dist } = await service
    .from("galley_distributions")
    .select(
      "id, carousel_paths, caption_de, caption_en, post_title, video_path, reel_status, reel_post_id",
    )
    .eq("galley_id", galleyId)
    .maybeSingle();
  if (!dist) {
    return NextResponse.json(
      { error: "No assets generated yet — generate the carousel first" },
      { status: 400 },
    );
  }

  // ---- Render: slides → 9:16 slideshow MP4 (+ music) → storage -------------
  if (action === "render") {
    const paths = (dist.carousel_paths as string[]) ?? [];
    if (paths.length < 1) {
      return NextResponse.json({ error: "No carousel slides to render" }, { status: 400 });
    }
    try {
      const audioFile = await pickAudioFile();
      const mp4 = await renderReelVideo({ slideUrls: paths.map(publicUrl), audioFile });
      const videoPath = `campaign-assets/${galleyId}/reel.mp4`;
      const { error: upErr } = await service.storage
        .from(BUCKET)
        .upload(videoPath, mp4, { contentType: "video/mp4", upsert: true });
      if (upErr) throw new Error(`reel upload: ${upErr.message}`);

      await service.from("galley_distributions").update({ video_path: videoPath }).eq("id", dist.id);

      logger.info("campaign_studio.reel.rendered", {
        runId: id,
        bytes: mp4.length,
        hasAudio: !!audioFile,
      });
      return NextResponse.json({
        ok: true,
        videoUrl: publicUrl(videoPath),
        hasAudio: !!audioFile,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error("campaign_studio.reel.render_failed", { runId: id, message });
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ---- Publish: post the rendered MP4 to Instagram as a Reel ---------------
  if (!dist.video_path) {
    return NextResponse.json({ error: "Render the reel before posting" }, { status: 400 });
  }
  if (dist.reel_status === "published" && dist.reel_post_id) {
    return NextResponse.json({ ok: true, igPostId: dist.reel_post_id, alreadyPublished: true });
  }
  const caption = (locale === "en" ? dist.caption_en : dist.caption_de) ?? "";

  try {
    const { igPostId } = await postReelToInstagram({
      videoUrl: publicUrl(dist.video_path),
      caption,
    });

    await service
      .from("galley_distributions")
      .update({ reel_post_id: igPostId, reel_status: "published", reel_error: null })
      .eq("id", dist.id);

    await tagOrganicPost({
      igPostId,
      distributionId: dist.id,
      galleyId,
      language: locale,
      mediaFormat: "video",
      placement: "organic-ig-reel",
      postTitle: dist.post_title,
    }).catch(() => {});

    logger.info("campaign_studio.reel.published", { runId: id, igPostId });
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
      .update({ reel_status: "failed", reel_error: message })
      .eq("id", dist.id);

    logger.error("campaign_studio.reel.publish_failed", { runId: id, message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
