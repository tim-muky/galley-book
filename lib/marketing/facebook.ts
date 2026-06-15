/**
 * Facebook Page publishing (GAL-453).
 *
 * Reuses the same Meta System User → Page access token as Instagram
 * (`getPageAccessToken` in `instagram.ts`), so there's no new auth to set up —
 * the system user already manages the Page that backs the IG business account.
 *
 * Posts a multi-photo update to the galleybook Facebook Page (Graph API v25.0):
 *   1. POST /{page-id}/photos  per image (url, published=false) → photo ids
 *   2. POST /{page-id}/feed    (message, attached_media[i]={media_fbid}) → post id
 *
 * Images must be on a publicly reachable URL — the same public carousel slide
 * URLs we hand to Instagram.
 */

import { logger } from "@/lib/logger";
import { META } from "./meta-config";
import { getPageAccessToken } from "./instagram";

const GRAPH = "https://graph.facebook.com/v25.0";

interface MetaError {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export class FacebookApiError extends Error {
  readonly code?: number;
  readonly subcode?: number;
  readonly fbtrace?: string;
  constructor(message: string, meta?: MetaError["error"]) {
    super(message);
    this.name = "FacebookApiError";
    this.code = meta?.code;
    this.subcode = meta?.error_subcode;
    this.fbtrace = meta?.fbtrace_id;
  }
}

async function metaPost<T>(url: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(url, { method: "POST", body: new URLSearchParams(params) });
  const json = (await res.json().catch(() => ({}))) as T & MetaError;
  if (!res.ok || (json as MetaError).error) {
    const err = (json as MetaError).error;
    throw new FacebookApiError(err?.message ?? `Meta API ${res.status} for ${url}`, err);
  }
  return json as T;
}

export interface PostPhotosToFacebookInput {
  /** Public JPEG URLs, in display order. */
  imageUrls: string[];
  /** Post message (caption, already includes hashtags). */
  message: string;
}

export interface PostPhotosToFacebookResult {
  postId: string;
}

/**
 * Publish a multi-photo post to the galleybook Facebook Page. Uploads each
 * slide unpublished, then attaches them all to one feed post. Throws
 * FacebookApiError with the Meta message on any failure.
 */
export async function postPhotosToFacebookPage({
  imageUrls,
  message,
}: PostPhotosToFacebookInput): Promise<PostPhotosToFacebookResult> {
  if (imageUrls.length < 1) {
    throw new FacebookApiError("Need at least 1 image to post");
  }
  const token = await getPageAccessToken();
  const pageId = META.pageId;

  // 1) Upload each photo unpublished → collect media_fbid
  const mediaFbids = await Promise.all(
    imageUrls.map(async (url) => {
      const { id } = await metaPost<{ id: string }>(`${GRAPH}/${pageId}/photos`, {
        url,
        published: "false",
        access_token: token,
      });
      return id;
    }),
  );

  // 2) Feed post with all photos attached (indexed attached_media[i] is the
  //    documented form for multi-photo posts).
  const params: Record<string, string> = { message, access_token: token };
  mediaFbids.forEach((media_fbid, i) => {
    params[`attached_media[${i}]`] = JSON.stringify({ media_fbid });
  });
  const { id: postId } = await metaPost<{ id: string }>(`${GRAPH}/${pageId}/feed`, params);

  logger.info("campaign_studio.fb.published", { postId, photoCount: imageUrls.length });
  return { postId };
}
