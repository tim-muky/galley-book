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
        params: { image_url, is_carousel_item: "true", access_token: token },
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
