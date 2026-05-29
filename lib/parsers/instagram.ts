import type { createClient } from "@/lib/supabase/server";
import type { FetchResult, ParseDiagnostics } from "./types";
import { extractImageUrl } from "./utils";
import { fetchViaPerplexity } from "./perplexity";
import { logger } from "@/lib/logger";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(p|reel|tv)\//i.test(url);
}

type InstagramOEmbed =
  | { kind: "ok"; caption: string; thumbnailUrl: string | null }
  | { kind: "gated"; ageRestricted: boolean }
  | { kind: "none" };

/** Public web oEmbed JSON (no login required). Returns the full caption plus
 *  cover thumbnail for readable posts, or a gating signal for age-restricted /
 *  private ones. More reliable than scraping the embed HTML when Instagram
 *  serves a CSR shell.
 *
 *  The documented api.instagram.com/oembed endpoint is deprecated (302 → login);
 *  this internal www endpoint still serves structured metadata unauthenticated. */
async function fetchInstagramOEmbed(url: string): Promise<InstagramOEmbed> {
  try {
    const endpoint = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(url)}`;
    const res = await fetch(endpoint, {
      headers: { "User-Agent": IPHONE_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    // Gated posts answer with HTTP 400 but a JSON body carrying the gating
    // reason, so parse the body regardless of status; bail only if it isn't JSON.
    const raw = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { kind: "none" };
    }

    // Gating payload carries `message` instead of a caption, e.g.
    // { message: "geoblock_required", blocks_logging_data: "MIN_AGE_ACCOUNT",
    //   title: "People under 21 can't see this content" }.
    if (typeof data.message === "string") {
      const ageRestricted =
        /MIN_AGE/i.test(String(data.blocks_logging_data ?? "")) ||
        data.message === "geoblock_required";
      return { kind: "gated", ageRestricted };
    }

    const caption = typeof data.title === "string" ? data.title : "";
    const thumbnailUrl = typeof data.thumbnail_url === "string" ? data.thumbnail_url : null;
    if (caption || thumbnailUrl) return { kind: "ok", caption, thumbnailUrl };
    return { kind: "none" };
  } catch {
    return { kind: "none" };
  }
}

/** Extract the post photo from an Instagram embed page.
 *  In Apr 2026 Instagram migrated embed/captioned/ to a CSR React app and stopped
 *  emitting <meta og:image>. The SSR'd photo lives in <img class="EmbeddedMediaImage" src="..."> instead.
 *  These CDN URLs need the Instagram Referer to load — the client proxies them via /api/proxy-image. */
function extractInstagramEmbedImage(html: string): string | null {
  // Try src before class order (standard) and src after class order (alt layout)
  const m =
    html.match(/<img[^>]*class=["'][^"']*EmbeddedMediaImage[^"']*["'][^>]*src=["']([^"']+)["']/i) ??
    html.match(/<img[^>]*src=["']([^"']+)["'][^>]*class=["'][^"']*EmbeddedMediaImage[^"']*["']/i);
  if (!m?.[1]) return null;
  return m[1].replace(/&amp;/g, "&");
}

const RECIPE_SIGNAL_RE = /\b(ingredient|tbsp|tsp|cup|gram|g\b|ml\b|oz\b|lb\b|serves|servings?|prep|cook|bake|fry|boil|simmer|chop|slice|dice|mix|stir|add|heat|pour|season|pinch|handful|tablespoon|teaspoon)\b/i;

/** Returns true if the stripped embed text looks like it contains recipe content. */
function hasRecipeSignal(text: string): boolean {
  return RECIPE_SIGNAL_RE.test(text);
}

interface EmbedResult {
  text: string;
  imageUrl: string | null;
  /** Diagnostics from the embed attempt — the leg most affected by datacenter-IP blocking. */
  httpStatus: number | null;
  bytes: number;
  textLength: number;
}

/** Fetch the Instagram embed page once, extract both caption text and cover image. */
async function fetchInstagramEmbedPage(url: string): Promise<EmbedResult> {
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  if (!match) return { text: "", imageUrl: null, httpStatus: null, bytes: 0, textLength: 0 };
  const shortcode = match[1];
  const isReel = /instagram\.com\/reel\//i.test(url);

  // Track the most informative attempt for diagnostics: the last HTTP status
  // seen, the largest response, and the longest stripped text. When IG blocks
  // the server IP, status is often 200 but the body is a ~89KB login stub with
  // <200 chars of real text — these three numbers make that visible in logs.
  let lastStatus: number | null = null;
  let maxBytes = 0;
  let maxTextLength = 0;

  // Try the post type that matches the URL first to avoid unnecessary redirects
  const embedUrls = isReel
    ? [
        `https://www.instagram.com/reel/${shortcode}/embed/captioned/`,
        `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
        `https://www.instagram.com/reel/${shortcode}/embed/`,
        `https://www.instagram.com/p/${shortcode}/embed/`,
      ]
    : [
        `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
        `https://www.instagram.com/reel/${shortcode}/embed/captioned/`,
        `https://www.instagram.com/p/${shortcode}/embed/`,
        `https://www.instagram.com/reel/${shortcode}/embed/`,
      ];

  for (const embedUrl of embedUrls) {
    try {
      const res = await fetch(embedUrl, {
        headers: {
          "User-Agent": IPHONE_UA,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(8000),
      });
      lastStatus = res.status;
      if (!res.ok) continue;
      const html = await res.text();
      maxBytes = Math.max(maxBytes, html.length);

      const imageUrl =
        extractInstagramEmbedImage(html) ?? extractImageUrl(html) ?? null;

      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      maxTextLength = Math.max(maxTextLength, text.length);

      // Require both minimum length and at least one recipe signal word to
      // guard against login-wall pages or rate-limit stubs that pass the
      // length check but contain no actual recipe content.
      if (text.length > 200 && hasRecipeSignal(text)) {
        return { text: text.slice(0, 6000), imageUrl, httpStatus: lastStatus, bytes: maxBytes, textLength: maxTextLength };
      }

      // If content lacks recipe signal but we got an image, keep trying other
      // embed URLs for better text — but preserve the image if nothing else works.
      if (imageUrl && !text) {
        return { text: "", imageUrl, httpStatus: lastStatus, bytes: maxBytes, textLength: maxTextLength };
      }
    } catch {
      continue;
    }
  }
  return { text: "", imageUrl: null, httpStatus: lastStatus, bytes: maxBytes, textLength: maxTextLength };
}

/** Download an Instagram CDN image and re-host it in Supabase Storage.
 *
 * Instagram CDN URLs (cdninstagram.com / fbcdn.net) are signed and expire within
 * seconds to minutes. Fetching the same URL again at recipe-save time silently fails,
 * leaving recipes without photos. Caching at parse time gives us a stable URL that
 * survives the round-trip back to the client and the subsequent save call.
 */
export interface CachedTempImage {
  /** Storage path inside the `recipe-temp` bucket. Server-side reference. */
  tempPath: string;
  /** Signed URL for in-app preview before save. Valid 24h (matches cleanup TTL). */
  previewUrl: string;
}

/**
 * GAL-306: uploads to the **private** `recipe-temp` bucket. Returns the path
 * (canonical reference for server-side temp→permanent copy on save) plus a
 * 24h signed preview URL so the parse response can render the image in-app.
 * Caller is responsible for handing the path back to the save flow.
 */
export async function cacheInstagramImage(
  cdnUrl: string,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<CachedTempImage | null> {
  try {
    const res = await fetch(cdnUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        Referer: "https://www.instagram.com/",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      logger.warn("instagram_image_fetch_failed", { status: res.status, cdnUrl });
      return null;
    }
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > 5 * 1024 * 1024) {
      logger.warn("instagram_image_too_large", { bytes: buffer.byteLength });
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const tempPath = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("recipe-temp")
      .upload(tempPath, buffer, { contentType, upsert: false });
    if (uploadError) {
      logger.warn("recipe_temp_upload_failed", { tempPath, error: uploadError.message });
      return null;
    }
    const { data: signed, error: signError } = await supabase.storage
      .from("recipe-temp")
      .createSignedUrl(tempPath, 24 * 60 * 60);
    if (signError || !signed?.signedUrl) {
      logger.warn("recipe_temp_sign_failed", { tempPath, error: signError?.message });
      return null;
    }
    return { tempPath, previewUrl: signed.signedUrl };
  } catch (err) {
    logger.warn("cache_instagram_image_threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function parseInstagram(url: string): Promise<FetchResult> {
  const embed = await fetchInstagramEmbedPage(url);
  const { text: embedContent, imageUrl } = embed;

  // Diagnostics accumulate across the routes so a failed import in production
  // logs (and the import-test report) reveals *which leg* failed and what the
  // server actually saw — the key signal for diagnosing datacenter-IP blocking.
  const diagnostics: ParseDiagnostics = {
    embedHttpStatus: embed.httpStatus,
    embedBytes: embed.bytes,
    embedTextLength: embed.textLength,
    oembedOutcome: "skipped",
  };

  // 1. Embed scrape returned a usable caption.
  if (embedContent.length > 200) {
    return {
      content: embedContent,
      imageUrl,
      imageCandidates: imageUrl ? [imageUrl] : [],
      parsedVia: "instagram_caption",
      imageSource: imageUrl ? "instagram_embed" : "none",
      diagnostics: { ...diagnostics, routeWinner: "instagram_caption" },
    };
  }

  // 2. Embed was blocked or too thin — try the public oEmbed JSON, which often
  //    still carries the full caption + thumbnail, and classifies gated posts.
  const oembed = await fetchInstagramOEmbed(url);
  diagnostics.oembedOutcome =
    oembed.kind === "ok"
      ? "ok"
      : oembed.kind === "gated"
        ? oembed.ageRestricted
          ? "gated_age"
          : "gated_other"
        : "none";

  if (
    oembed.kind === "ok" &&
    (oembed.caption.length > 80 || imageUrl || oembed.thumbnailUrl)
  ) {
    const img = imageUrl ?? oembed.thumbnailUrl;
    return {
      content: oembed.caption.slice(0, 6000),
      imageUrl: img,
      imageCandidates: img ? [img] : [],
      parsedVia: "instagram_caption",
      imageSource: img ? "instagram_embed" : "none",
      diagnostics: { ...diagnostics, routeWinner: "instagram_caption" },
    };
  }
  if (oembed.kind === "gated") {
    return {
      content: "",
      imageUrl: null,
      imageCandidates: [],
      parsedVia: "none",
      imageSource: "none",
      diagnostics,
      error: oembed.ageRestricted
        ? "This Instagram account is age-restricted, so its posts can't be read automatically. Open the post in the Instagram app and paste the recipe in manually."
        : "This Instagram post is private or no longer available, so it can't be read automatically. Paste the recipe in manually.",
    };
  }

  // 3. Last resort — Perplexity web summary.
  if (process.env.PERPLEXITY_API_KEY) {
    const content = await fetchViaPerplexity(url, { kind: "instagram" });
    if (/unable to access|cannot access|requires? login|not publicly|private post/i.test(content)) {
      return {
        content: "",
        imageUrl: null,
        imageCandidates: [],
        parsedVia: "none",
        imageSource: "none",
        diagnostics,
        error:
          "This Instagram post can't be read automatically — it may be private, age-restricted, or login-walled. Paste the recipe in manually.",
      };
    }
    return {
      content,
      imageUrl,
      imageCandidates: imageUrl ? [imageUrl] : [],
      parsedVia: "instagram_perplexity",
      imageSource: imageUrl ? "instagram_embed" : "none",
      diagnostics: { ...diagnostics, routeWinner: "instagram_perplexity" },
    };
  }

  return {
    content: "",
    imageUrl: null,
    imageCandidates: [],
    parsedVia: "none",
    imageSource: "none",
    diagnostics,
    error: "This Instagram post can't be read automatically. Paste the recipe in manually.",
  };
}
