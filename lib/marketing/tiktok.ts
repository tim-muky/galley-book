/**
 * TikTok Content Posting API — one-click photo-carousel publishing.
 *
 * Mirrors lib/marketing/instagram.ts. Our Campaign Studio carousel slides are
 * published to TikTok as a PHOTO post (TikTok supports up to 35 images).
 *
 * Auth: TikTok user access tokens are short-lived (24h). We prefer a long-lived
 * refresh token (TIKTOK_REFRESH_TOKEN, valid ~365 days) + client key/secret and
 * mint a fresh access token per publish; a direct TIKTOK_ACCESS_TOKEN is honored
 * as a fallback for quick testing.
 *
 * Flow (https://open.tiktokapis.com):
 *   1. POST /v2/post/publish/creator_info/query/   → available privacy levels
 *   2. POST /v2/post/publish/content/init/         → publish_id  (media_type PHOTO)
 *   3. POST /v2/post/publish/status/fetch/         → poll to PUBLISH_COMPLETE
 *
 * Two hard external constraints (TikTok, verified docs):
 *   - PULL_FROM_URL image URLs must sit on a domain verified in the TikTok app.
 *     Supabase URLs (*.supabase.co) can't be verified, so callers pass URLs on
 *     our own verified domain (the public slide proxy under /api/public/...).
 *   - Unaudited apps force every post to private (SELF_ONLY). Public posting
 *     (PUBLIC_TO_EVERYONE) requires TikTok's Content Posting API audit.
 */

import { logger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";

const API = "https://open.tiktokapis.com";
const MAX_PHOTOS = 35;

export type TikTokPrivacy =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "FOLLOWER_OF_CREATOR"
  | "SELF_ONLY";

/** TikTok wraps responses as { data, error:{ code, message, log_id } }. */
interface TikTokEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string; log_id?: string };
}

export class TikTokApiError extends Error {
  readonly code?: string;
  readonly logId?: string;
  constructor(message: string, code?: string, logId?: string) {
    super(message);
    this.name = "TikTokApiError";
    this.code = code;
    this.logId = logId;
  }
}

async function tiktokPost<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => ({}))) as TikTokEnvelope<T>;
  const code = json.error?.code;
  if (!res.ok || (code && code !== "ok")) {
    throw new TikTokApiError(
      json.error?.message || `TikTok API ${res.status} for ${path}`,
      code,
      json.error?.log_id,
    );
  }
  return (json.data ?? ({} as T)) as T;
}

// ---- Auth ------------------------------------------------------------------

let cachedToken: { token: string; at: number } | null = null;
const TOKEN_TTL_MS = 20 * 60 * 1000; // refresh well inside the 24h access-token life

interface TikTokTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  error?: string;
  error_description?: string;
}

/** Exchange a refresh token for a fresh access token (TikTok rotates the refresh token too). */
async function refreshAccessToken(
  refreshToken: string,
  clientKey: string,
  clientSecret: string,
): Promise<Required<Pick<TikTokTokenResponse, "access_token">> & TikTokTokenResponse> {
  const res = await fetch(`${API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as TikTokTokenResponse;
  if (!res.ok || !json.access_token) {
    throw new TikTokApiError(
      json.error_description || json.error || "TikTok token refresh failed",
      json.error,
    );
  }
  return { ...json, access_token: json.access_token };
}

/**
 * A current user access token. Prefers the OAuth connection stored via the admin
 * "Connect TikTok" flow (tiktok_oauth singleton, refresh token rotated on each
 * use); falls back to the TIKTOK_REFRESH_TOKEN / TIKTOK_ACCESS_TOKEN env vars when
 * no connection row exists.
 */
export async function getTikTokAccessToken(): Promise<string> {
  if (cachedToken && Date.now() - cachedToken.at < TOKEN_TTL_MS) {
    return cachedToken.token;
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  // 1. Connection stored by the admin OAuth flow.
  if (clientKey && clientSecret) {
    const service = createServiceClient();
    const { data: stored } = await service
      .from("tiktok_oauth")
      .select("refresh_token")
      .eq("id", 1)
      .maybeSingle();
    if (stored?.refresh_token) {
      const json = await refreshAccessToken(stored.refresh_token, clientKey, clientSecret);
      const now = Date.now();
      await service
        .from("tiktok_oauth")
        .update({
          access_token: json.access_token,
          refresh_token: json.refresh_token ?? stored.refresh_token,
          access_token_expires_at: json.expires_in
            ? new Date(now + json.expires_in * 1000).toISOString()
            : null,
          refresh_token_expires_at: json.refresh_expires_in
            ? new Date(now + json.refresh_expires_in * 1000).toISOString()
            : null,
          updated_at: new Date(now).toISOString(),
        })
        .eq("id", 1);
      cachedToken = { token: json.access_token, at: now };
      return json.access_token;
    }
  }

  // 2. Env refresh token (legacy / pre-connection fallback).
  const refreshToken = process.env.TIKTOK_REFRESH_TOKEN;
  if (refreshToken && clientKey && clientSecret) {
    const json = await refreshAccessToken(refreshToken, clientKey, clientSecret);
    cachedToken = { token: json.access_token, at: Date.now() };
    return json.access_token;
  }

  // 3. Direct access token (quick testing).
  const direct = process.env.TIKTOK_ACCESS_TOKEN;
  if (direct) return direct;

  throw new TikTokApiError(
    "TikTok not connected — connect the account in Admin → Social Media, or set TIKTOK_REFRESH_TOKEN + TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET (or TIKTOK_ACCESS_TOKEN)",
  );
}

// ---- Creator info ----------------------------------------------------------

interface CreatorInfo {
  creator_username?: string;
  privacy_level_options?: TikTokPrivacy[];
  comment_disabled?: boolean;
}

/**
 * Pick the privacy level to post with. TikTok requires DIRECT_POST to use a
 * level the creator currently allows; unaudited apps only ever return SELF_ONLY.
 * Prefer the configured level when it's available, else the first allowed one.
 */
async function resolvePrivacy(token: string): Promise<{ privacy: TikTokPrivacy; username?: string }> {
  const configured = (process.env.TIKTOK_PRIVACY_LEVEL as TikTokPrivacy) || "SELF_ONLY";
  try {
    const info = await tiktokPost<CreatorInfo>("/v2/post/publish/creator_info/query/", token, {});
    const options = info.privacy_level_options ?? [];
    const privacy = options.includes(configured) ? configured : (options[0] ?? configured);
    return { privacy, username: info.creator_username };
  } catch (err) {
    // creator_info is advisory; fall back to the configured level (SELF_ONLY is
    // always safe and the only thing an unaudited app can use).
    logger.warn("campaign_studio.tiktok.creator_info_failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return { privacy: configured };
  }
}

// ---- Status polling --------------------------------------------------------

async function waitForPublish(
  publishId: string,
  token: string,
  { tries = 20, delayMs = 3000 }: { tries?: number; delayMs?: number } = {},
): Promise<string> {
  for (let i = 0; i < tries; i++) {
    const { status } = await tiktokPost<{ status?: string; fail_reason?: string }>(
      "/v2/post/publish/status/fetch/",
      token,
      { publish_id: publishId },
    );
    if (status === "PUBLISH_COMPLETE") return status;
    if (status === "FAILED") {
      throw new TikTokApiError(`TikTok publish ${publishId} failed`);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  // Not terminal yet — TikTok is still processing. Treat as accepted; the post
  // lands shortly. The caller stores the publish id either way.
  return "PROCESSING_UPLOAD";
}

// ---- Public API ------------------------------------------------------------

export interface PostPhotosInput {
  /** Public JPEG URLs on a TikTok-verified domain, 1–35 items, display order. */
  imageUrls: string[];
  /** Post title (TikTok caps at 90 UTF-16 runes). */
  title: string;
  /** Caption / description (TikTok caps at 4000 runes; already includes hashtags). */
  description: string;
}

export interface PostPhotosResult {
  publishId: string;
  status: string;
  privacy: TikTokPrivacy;
}

/**
 * Publish the carousel slides to the galleybook TikTok account as a photo post.
 * Throws TikTokApiError with the API message on any failure.
 */
export async function postPhotosToTikTok({
  imageUrls,
  title,
  description,
}: PostPhotosInput): Promise<PostPhotosResult> {
  if (imageUrls.length < 1) {
    throw new TikTokApiError("A TikTok photo post needs at least 1 image");
  }
  if (imageUrls.length > MAX_PHOTOS) {
    throw new TikTokApiError(`TikTok photo posts are limited to ${MAX_PHOTOS} images`);
  }

  const token = await getTikTokAccessToken();
  const { privacy } = await resolvePrivacy(token);
  // DIRECT_POST publishes straight to the profile; MEDIA_UPLOAD drops the post
  // into TikTok's in-app editor to finish manually (the only option for apps
  // without the Direct Post audit, if Direct Post is rejected).
  const postMode = process.env.TIKTOK_POST_MODE === "MEDIA_UPLOAD" ? "MEDIA_UPLOAD" : "DIRECT_POST";

  const { publish_id } = await tiktokPost<{ publish_id: string }>(
    "/v2/post/publish/content/init/",
    token,
    {
      media_type: "PHOTO",
      post_mode: postMode,
      post_info: {
        title: title.slice(0, 90),
        description: description.slice(0, 4000),
        privacy_level: privacy,
        disable_comment: false,
        auto_add_music: true,
        brand_content_toggle: false,
        brand_organic_toggle: false,
      },
      source_info: {
        source: "PULL_FROM_URL",
        photo_images: imageUrls,
        photo_cover_index: 0,
      },
    },
  );

  const status = await waitForPublish(publish_id, token);

  logger.info("campaign_studio.tiktok.published", {
    publishId: publish_id,
    itemCount: imageUrls.length,
    privacy,
    postMode,
    status,
  });
  return { publishId: publish_id, status, privacy };
}

// ---- Video (reel) ----------------------------------------------------------

export interface PostVideoInput {
  /** Public MP4 URL on a TikTok-verified domain (the reel proxy). */
  videoUrl: string;
  /** Caption (TikTok video title; caps at 2200 runes; already includes hashtags). */
  caption: string;
}

/**
 * Publish the rendered reel MP4 to the galleybook TikTok account as a video —
 * TikTok's native format. Same content/init → status flow as the photo post,
 * with media_type VIDEO + a PULL_FROM_URL video_url.
 *
 * NOTE: untested end-to-end until TIKTOK_* env is set and the app passes
 * TikTok's audit — re-verify the post_info/source_info shape against current
 * TikTok Content Posting docs before going public.
 */
export async function postVideoToTikTok({
  videoUrl,
  caption,
}: PostVideoInput): Promise<PostPhotosResult> {
  const token = await getTikTokAccessToken();
  const { privacy } = await resolvePrivacy(token);
  const postMode = process.env.TIKTOK_POST_MODE === "MEDIA_UPLOAD" ? "MEDIA_UPLOAD" : "DIRECT_POST";

  const { publish_id } = await tiktokPost<{ publish_id: string }>(
    "/v2/post/publish/content/init/",
    token,
    {
      media_type: "VIDEO",
      post_mode: postMode,
      post_info: {
        title: caption.slice(0, 2200),
        privacy_level: privacy,
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: videoUrl,
      },
    },
  );

  const status = await waitForPublish(publish_id, token);

  logger.info("campaign_studio.tiktok.reel_published", { publishId: publish_id, privacy, postMode, status });
  return { publishId: publish_id, status, privacy };
}
