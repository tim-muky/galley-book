import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { pushAdCreative, MetaAdsError } from "@/lib/marketing/meta-ads";
import type { AdVariant } from "@/lib/marketing/ad-copy";
import { NextResponse } from "next/server";

// Each variant = 2 Marketing API calls (creative + ad). A handful of variants
// stays well within the default budget, but give headroom.
export const maxDuration = 120;

const BUCKET = "recipe-photos";

function publicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;

  const { id } = await params;
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
    .select("id, carousel_paths, ad_variants, meta_status")
    .eq("galley_id", galleyId)
    .maybeSingle();
  if (!dist) {
    return NextResponse.json({ error: "Generate assets first" }, { status: 400 });
  }

  const variants = (dist.ad_variants as AdVariant[] | null) ?? [];
  const carouselPaths = (dist.carousel_paths as string[] | null) ?? [];
  if (variants.length === 0) {
    return NextResponse.json({ error: "No ad variants to push" }, { status: 400 });
  }
  if (carouselPaths.length === 0) {
    return NextResponse.json({ error: "No image available for the ad creative" }, { status: 400 });
  }

  // Use the carousel cover as the ad image; deep-link to the galley with paid UTM.
  const heroImage = publicUrl(carouselPaths[0]);
  const linkUrl = `https://galleybook.com/galley/${galleyId}?utm_source=meta&utm_medium=paid_social&utm_campaign=gotw`;

  try {
    const pushed: { format: string; creativeId: string; adId: string }[] = [];
    for (const v of variants) {
      const { creativeId, adId } = await pushAdCreative({
        imageUrl: heroImage,
        headline: v.headline,
        primaryText: v.primaryText,
        linkUrl,
        name: `GOTW ${v.format} — ${galleyId.slice(0, 8)}`,
      });
      pushed.push({ format: v.format, creativeId, adId });
    }

    await service
      .from("galley_distributions")
      .update({ meta_creative_ids: pushed, meta_status: "pushed", meta_error: null })
      .eq("id", dist.id);

    logger.info("campaign_studio.ads.pushed", { runId: id, count: pushed.length });
    return NextResponse.json({ ok: true, pushed });
  } catch (err) {
    const message =
      err instanceof MetaAdsError
        ? `${err.message}${err.code ? ` (code ${err.code})` : ""}`
        : err instanceof Error
          ? err.message
          : "Unknown error";
    await service
      .from("galley_distributions")
      .update({ meta_status: "failed", meta_error: message })
      .eq("id", dist.id);
    logger.error("campaign_studio.ads.push_failed", { runId: id, message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
