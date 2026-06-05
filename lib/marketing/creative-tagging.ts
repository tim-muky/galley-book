/**
 * Creative attribute tagging (GAL-430, part 1).
 *
 * After a distribution's ads are pushed, record structured attributes per
 * creative (keyed by Meta ad id) so the learning loop can attribute performance
 * to angle / format / theme / hook / CTA / language / placement. Best-effort —
 * tagging never fails the push.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import type { AdVariant } from "./ad-copy";

const HOOK_BY_ANGLE: Record<string, string> = { problem: "pain-point", hero: "appetite" };
const CTA_BY_ANGLE: Record<string, string> = { problem: "import", hero: "save-to-galley" };

interface CreativeIdEntry {
  adId: string;
  format: string;
}

/**
 * Tag every pushed creative for a distribution. Reads the stored distribution
 * (creative ids + ad variants + media context) and upserts creative_attributes.
 * Returns the number tagged.
 */
export async function tagPushedCreatives(distributionId: string): Promise<number> {
  const service = createServiceClient();
  const { data: dist, error } = await service
    .from("galley_distributions")
    .select(
      "id, galley_id, post_title, caption_de, caption_en, carousel_paths, video_path, ad_variants, meta_creative_ids",
    )
    .eq("id", distributionId)
    .single();
  if (error || !dist) {
    logger.error("growth.tagging.dist_missing", { distributionId, message: error?.message });
    return 0;
  }

  const creatives = (dist.meta_creative_ids as CreativeIdEntry[] | null) ?? [];
  const variants = (dist.ad_variants as AdVariant[] | null) ?? [];
  const carouselPaths = (dist.carousel_paths as string[] | null) ?? [];
  const mediaFormat = dist.video_path ? "video" : carouselPaths.length > 1 ? "carousel" : "single";
  const language = dist.caption_de ? "de" : dist.caption_en ? "en" : "de";

  // meta_creative_ids is built in the same order as ad_variants on push, so
  // index aligns the creative to its copy.
  const rows = creatives.map((c, i) => {
    const angle = c.format ?? "unknown";
    const v = variants[i];
    return {
      ad_id: c.adId,
      distribution_id: dist.id,
      galley_id: dist.galley_id,
      angle,
      media_format: mediaFormat,
      theme: dist.post_title,
      hook_type: HOOK_BY_ANGLE[angle] ?? "other",
      cta: CTA_BY_ANGLE[angle] ?? "import",
      language,
      placement: "advantage+",
      headline: v?.headline ?? null,
      primary_text: v?.primaryText ?? null,
    };
  });
  if (rows.length === 0) return 0;

  const { error: upErr } = await service
    .from("creative_attributes")
    .upsert(rows, { onConflict: "ad_id" });
  if (upErr) {
    logger.error("growth.tagging.upsert_failed", { distributionId, message: upErr.message });
    return 0;
  }
  logger.info("growth.tagging.tagged", { distributionId, count: rows.length });
  return rows.length;
}
