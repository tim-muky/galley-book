/**
 * Instagram Graph API — one-click carousel publishing (GAL-392).
 *
 * Auth model (set up in GAL-394): we hold a long-lived System User token in
 * `META_SYSTEM_USER_TOKEN`. Page-level + IG publishing calls need a *Page*
 * access token, which we derive at runtime from the system token via
 * `/me/accounts` (the system user can mint page tokens that don't expire).
 *
 * Carousel publish is a 3-step flow on Graph API v25.0:
 *   1. POST /{ig}/media  per image  (image_url, is_carousel_item=true) → child ids
 *   2. POST /{ig}/media  (media_type=CAROUSEL, children=csv, caption)  → parent id
 *   3. POST /{ig}/media_publish  (creation_id=parent id)               → media id
 *
 * Constraints (Meta, verified v25.0): JPEG only, images must be on a publicly
 * reachable URL, max 10 items per carousel, 100 published posts / 24h.
 */

import { logger } from "@/lib/logger";
import { META } from "./meta-config";

const GRAPH = "https://graph.facebook.com/v25.0";
const MAX_CAROUSEL_ITEMS = 10;

/** Meta returns errors as { error: { message, type, code, error_subcode, fbtrace_id } } */
interface MetaError {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export class InstagramApiError extends Error {
  readonly code?: number;
  readonly subcode?: number;
  readonly fbtrace?: string;
  constructor(message: string, meta?: MetaError["error"]) {
    super(message);
    this.name = "InstagramApiError";
    this.code = meta?.code;
    this.subcode = meta?.error_subcode;
    this.fbtrace = meta?.fbtrace_id;
  }
}

async function metaFetch<T>(
  url: string,
  init: RequestInit & { params?: Record<string, string> },
): Promise<T> {
  const { params, ...rest } = init;
  const body = params ? new URLSearchParams(params) : undefined;
  const res = await fetch(url, { ...rest, body });
  const json = (await res.json().catch(() => ({}))) as T & MetaError;
  if (!res.ok || (json as MetaError).error) {
    const err = (json as MetaError).error;
    throw new InstagramApiError(
      err?.message ?? `Meta API ${res.status} for ${url}`,
      err,
    );
  }
  return json as T;
}

// ---- Page token (cached in module scope; survives within a warm function) ---

let cachedPageToken: { token: string; at: number } | null = null;
const PAGE_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Derive a Page access token from the System User token. Page tokens minted by
 * a system user don't expire, but we still cache briefly to avoid an extra
 * round-trip on every call.
 */
export async function getPageAccessToken(): Promise<string> {
  if (cachedPageToken && Date.now() - cachedPageToken.at < PAGE_TOKEN_TTL_MS) {
    return cachedPageToken.token;
  }
  const systemToken = process.env.META_SYSTEM_USER_TOKEN;
  if (!systemToken) throw new InstagramApiError("META_SYSTEM_USER_TOKEN not set");

  const data = await metaFetch<{ data?: { access_token: string; id: string }[] }>(
    `${GRAPH}/me/accounts?access_token=${encodeURIComponent(systemToken)}`,
    { method: "GET" },
  );
  const page = data.data?.[0];
  if (!page?.access_token) {
    throw new InstagramApiError("No Facebook Page found for this system user");
  }
  cachedPageToken = { token: page.access_token, at: Date.now() };
  return page.access_token;
}

// ---- Container status polling --------------------------------------------

/**
 * Image containers are usually FINISHED immediately, but the API can return
 * IN_PROGRESS briefly. Poll until terminal before publishing.
 */
async function waitForContainer(
  containerId: string,
  token: string,
  { tries = 10, delayMs = 1500 }: { tries?: number; delayMs?: number } = {},
): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const { status_code } = await metaFetch<{ status_code?: string }>(
      `${GRAPH}/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`,
      { method: "GET" },
    );
    if (status_code === "FINISHED") return;
    if (status_code === "ERROR" || status_code === "EXPIRED") {
      throw new InstagramApiError(`Container ${containerId} status: ${status_code}`);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new InstagramApiError(`Container ${containerId} not ready after ${tries} polls`);
}

// ---- Public API -----------------------------------------------------------

export interface PostCarouselInput {
  /** Public JPEG URLs, 2–10 items, in display order */
  imageUrls: string[];
  /** Full caption (already includes hashtags) */
  caption: string;
}

export interface PostCarouselResult {
  igPostId: string;
}

/**
 * Publish a carousel to the galleybook IG business account.
 * Throws InstagramApiError with the Meta message on any failure.
 */
export async function postCarouselToInstagram({
  imageUrls,
  caption,
}: PostCarouselInput): Promise<PostCarouselResult> {
  const igUserId = META.igUserId;
  if (imageUrls.length < 2) {
    throw new InstagramApiError("A carousel needs at least 2 images");
  }
  if (imageUrls.length > MAX_CAROUSEL_ITEMS) {
    throw new InstagramApiError(`Carousel limited to ${MAX_CAROUSEL_ITEMS} images`);
  }

  const token = await getPageAccessToken();

  // 1) Child item containers (parallel — independent uploads)
  const children = await Promise.all(
    imageUrls.map(async (image_url) => {
      const { id } = await metaFetch<{ id: string }>(`${GRAPH}/${igUserId}/media`, {
        method: "POST",
        params: {
          image_url,
          media_type: "IMAGE",
          is_carousel_item: "true",
          access_token: token,
        },
      });
      await waitForContainer(id, token);
      return id;
    }),
  );

  // 2) Parent carousel container
  const { id: creationId } = await metaFetch<{ id: string }>(
    `${GRAPH}/${igUserId}/media`,
    {
      method: "POST",
      params: {
        media_type: "CAROUSEL",
        children: children.join(","),
        caption,
        access_token: token,
      },
    },
  );
  await waitForContainer(creationId, token);

  // 3) Publish
  const { id: igPostId } = await metaFetch<{ id: string }>(
    `${GRAPH}/${igUserId}/media_publish`,
    { method: "POST", params: { creation_id: creationId, access_token: token } },
  );

  logger.info("campaign_studio.ig.published", {
    igPostId,
    itemCount: imageUrls.length,
  });
  return { igPostId };
}

// ---- Reels (GAL-452) ------------------------------------------------------

export interface PostReelInput {
  /** Public URL of the rendered MP4 (H.264/AAC, 9:16). */
  videoUrl: string;
  /** Full caption (already includes hashtags). */
  caption: string;
}

export interface PostReelResult {
  igPostId: string;
}

/**
 * Publish a Reel to the galleybook IG business account. Same 3-step flow as a
 * carousel but media_type=REELS with a video_url. Reels transcode server-side,
 * so the container can take 30–60s+ to reach FINISHED — we poll longer.
 */
export async function postReelToInstagram({
  videoUrl,
  caption,
}: PostReelInput): Promise<PostReelResult> {
  const igUserId = META.igUserId;
  const token = await getPageAccessToken();

  // 1) Create the REELS container.
  const { id: creationId } = await metaFetch<{ id: string }>(`${GRAPH}/${igUserId}/media`, {
    method: "POST",
    params: {
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      share_to_feed: "true",
      access_token: token,
    },
  });

  // 2) Wait for the async transcode (longer budget than images).
  await waitForContainer(creationId, token, { tries: 30, delayMs: 5000 });

  // 3) Publish.
  const { id: igPostId } = await metaFetch<{ id: string }>(
    `${GRAPH}/${igUserId}/media_publish`,
    { method: "POST", params: { creation_id: creationId, access_token: token } },
  );

  logger.info("campaign_studio.ig.reel_published", { igPostId });
  return { igPostId };
}

// ---- Comment → DM private reply (GAL-433) ---------------------------------

export interface PrivateReplyResult {
  recipientId?: string;
  messageId?: string;
}

/**
 * Send a private reply (DM) in response to a comment on one of our media. This
 * is the delivery half of the comment → DM mechanic: the `comments` webhook
 * (app/api/webhooks/instagram) matches the trigger word, then calls this to DM
 * the recipe link.
 *
 * Uses the Instagram Messaging endpoint `POST /{ig}/messages` with a
 * `recipient.comment_id` target — Meta routes the message to whoever left that
 * comment. Requires the `instagram_manage_messages` permission (App Review) and
 * must be sent within Meta's 7-day private-reply window; only one private reply
 * per comment is allowed.
 */
export async function sendCommentPrivateReply(
  commentId: string,
  text: string,
): Promise<PrivateReplyResult> {
  const token = await getPageAccessToken();
  const res = await metaFetch<{ recipient_id?: string; message_id?: string }>(
    `${GRAPH}/${META.igUserId}/messages`,
    {
      method: "POST",
      params: {
        recipient: JSON.stringify({ comment_id: commentId }),
        message: JSON.stringify({ text }),
        access_token: token,
      },
    },
  );
  logger.info("campaign_studio.ig.private_reply_sent", {
    commentId,
    messageId: res.message_id,
  });
  return { recipientId: res.recipient_id, messageId: res.message_id };
}

// ---- Organic insights (GAL-425) -------------------------------------------

export interface IgPostEngagement {
  id: string;
  permalink: string;
  timestamp: string;
  likes: number;
  comments: number;
  saved: number | null;
}

export interface IgOrganicInsights {
  /** Account-level, for the day window. */
  account: { reach: number | null; profileViews: number | null; websiteClicks: number | null };
  /** Posts published within the lookback window, with lifetime engagement. */
  posts: IgPostEngagement[];
  totals: { posts: number; likes: number; comments: number; saved: number | null };
}

interface InsightResponse {
  data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[];
}

/** One account-level metric for the day. Best-effort — null on any failure. */
async function accountMetric(token: string, metric: string): Promise<number | null> {
  try {
    // v25 account insights return aggregates via metric_type=total → total_value.
    const json = await metaFetch<InsightResponse>(
      `${GRAPH}/${META.igUserId}/insights?metric=${metric}&period=day&metric_type=total&access_token=${encodeURIComponent(token)}`,
      { method: "GET" },
    );
    const row = json.data?.[0];
    return row?.total_value?.value ?? row?.values?.[0]?.value ?? null;
  } catch (e) {
    logger.error("growth.ig.account_metric_failed", { metric, message: String(e) });
    return null;
  }
}

/** Saves for one media (per-media insight). Best-effort — null on failure. */
async function mediaSaved(token: string, mediaId: string): Promise<number | null> {
  try {
    const json = await metaFetch<InsightResponse>(
      `${GRAPH}/${mediaId}/insights?metric=saved&access_token=${encodeURIComponent(token)}`,
      { method: "GET" },
    );
    return json.data?.[0]?.values?.[0]?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Organic IG engagement for the daily growth report (GAL-425). Account-level
 * reach / profile visits / website (link-in-bio) taps for the day, plus
 * per-post likes/comments/saves for posts in the lookback window. Every call is
 * wrapped so a missing metric or token never breaks the pipeline — callers get
 * nulls/[].
 */
export async function getOrganicIgInsights(
  { sinceDays = 7 }: { sinceDays?: number } = {},
): Promise<IgOrganicInsights> {
  const empty: IgOrganicInsights = {
    account: { reach: null, profileViews: null, websiteClicks: null },
    posts: [],
    totals: { posts: 0, likes: 0, comments: 0, saved: null },
  };

  let token: string;
  try {
    token = await getPageAccessToken();
  } catch (e) {
    logger.error("growth.ig.token_failed", { message: String(e) });
    return empty;
  }

  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;

  const [reach, profileViews, websiteClicks, mediaRes] = await Promise.all([
    accountMetric(token, "reach"),
    accountMetric(token, "profile_views"),
    accountMetric(token, "website_clicks"),
    metaFetch<{
      data?: { id: string; permalink: string; timestamp: string; like_count?: number; comments_count?: number }[];
    }>(
      `${GRAPH}/${META.igUserId}/media?fields=id,permalink,timestamp,like_count,comments_count&limit=25&access_token=${encodeURIComponent(token)}`,
      { method: "GET" },
    ).catch((e) => {
      logger.error("growth.ig.media_failed", { message: String(e) });
      return { data: [] as NonNullable<never>[] };
    }),
  ]);

  const recent = (mediaRes.data ?? []).filter(
    (m) => new Date(m.timestamp).getTime() >= cutoff,
  );
  const posts: IgPostEngagement[] = await Promise.all(
    recent.map(async (m) => ({
      id: m.id,
      permalink: m.permalink,
      timestamp: m.timestamp,
      likes: m.like_count ?? 0,
      comments: m.comments_count ?? 0,
      saved: await mediaSaved(token, m.id),
    })),
  );

  const savedVals = posts.map((p) => p.saved).filter((v): v is number => v != null);
  return {
    account: { reach, profileViews, websiteClicks },
    posts,
    totals: {
      posts: posts.length,
      likes: posts.reduce((s, p) => s + p.likes, 0),
      comments: posts.reduce((s, p) => s + p.comments, 0),
      saved: savedVals.length ? savedVals.reduce((s, v) => s + v, 0) : null,
    },
  };
}
