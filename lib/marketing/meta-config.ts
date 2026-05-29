/**
 * Non-secret Meta asset IDs for galleybook (set up in GAL-394 / GAL-54).
 *
 * These are stable, non-sensitive identifiers (visible in URLs / API responses),
 * so they live in code with an env override rather than per-environment Vercel
 * config. The ONE secret — the System User token — stays in
 * `META_SYSTEM_USER_TOKEN`. The browser pixel id is `NEXT_PUBLIC_META_PIXEL_ID`.
 */
export const META = {
  /** Ad account — Marketing API calls use the `act_` prefix (see adAccountPath). */
  adAccountId: process.env.META_AD_ACCOUNT_ID ?? "1503605791229179",
  /** Facebook Page backing the IG business account. */
  pageId: process.env.META_PAGE_ID ?? "1102747479595161",
  /** Instagram business account (content publishing). */
  igUserId: process.env.META_IG_USER_ID ?? "17841427581353009",
  /** Meta App (galley-ads). */
  appId: process.env.META_APP_ID ?? "977813498304961",
  /** Standing Advantage+ campaign skeleton (GAL-54). */
  campaignId: process.env.META_CAMPAIGN_ID ?? "52765486717127",
  /** Ad set inside the Advantage+ campaign. */
  adSetId: process.env.META_ADSET_ID ?? "52767615705727",
  /** Pixel / dataset id — also the Conversions API dataset (GAL-47). */
  pixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "986119167455201",
} as const;

/** Marketing API node path for the ad account, e.g. "act_1503605791229179". */
export const adAccountPath = `act_${META.adAccountId}`;
