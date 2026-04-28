import type { createClient } from "@/lib/supabase/server";
import type { FetchResult, ImageSource } from "./types";
import { extractImageUrl } from "./utils";
import { fetchViaPerplexity } from "./perplexity";

export function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(p|reel|tv)\//i.test(url);
}

/** Extract the post photo from an Instagram embed page.
 *  In Apr 2026 Instagram migrated embed/captioned/ to a CSR React app and stopped
 *  emitting <meta og:image>. The SSR'd photo lives in <img class="EmbeddedMediaImage" src="..."> instead.
 *  These CDN URLs need the Instagram Referer to load — the client proxies them via /api/proxy-image. */
function extractInstagramEmbedImage(html: string): string | null {
  const m = html.match(/<img[^>]*class=["']EmbeddedMediaImage["'][^>]*src=["']([^"']+)["']/i);
  if (!m?.[1]) return null;
  return m[1].replace(/&amp;/g, "&");
}

async function fetchInstagramImages(url: string): Promise<string[]> {
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  if (!match) return [];
  const shortcode = match[1];

  for (const embedUrl of [
    `https://www.instagram.com/reel/${shortcode}/embed/captioned/`,
    `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
    `https://www.instagram.com/reel/${shortcode}/embed/`,
    `https://www.instagram.com/p/${shortcode}/embed/`,
  ]) {
    try {
      const res = await fetch(embedUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const img = extractInstagramEmbedImage(html) ?? extractImageUrl(html);
      if (img) return [img];
    } catch {
      continue;
    }
  }
  return [];
}

/** Try fetching Instagram embed URL (public endpoint that includes post caption) */
async function fetchInstagramEmbed(url: string): Promise<string> {
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  if (!match) return "";
  const shortcode = match[1];

  for (const embedUrl of [
    `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
    `https://www.instagram.com/reel/${shortcode}/embed/captioned/`,
  ]) {
    try {
      const res = await fetch(embedUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text.length > 100) return text.slice(0, 6000);
    } catch {
      continue;
    }
  }
  return "";
}

/** Download an Instagram CDN image and re-host it in Supabase Storage.
 *
 * Instagram CDN URLs (cdninstagram.com / fbcdn.net) are signed and expire within
 * seconds to minutes. Fetching the same URL again at recipe-save time silently fails,
 * leaving recipes without photos. Caching at parse time gives us a stable URL that
 * survives the round-trip back to the client and the subsequent save call.
 */
export async function cacheInstagramImage(
  cdnUrl: string,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  try {
    const res = await fetch(cdnUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        Referer: "https://www.instagram.com/",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > 5 * 1024 * 1024) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const path = `temp/${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("recipe-photos")
      .upload(path, buffer, { contentType, upsert: false });
    if (error) return null;
    const { data: { publicUrl } } = supabase.storage.from("recipe-photos").getPublicUrl(path);
    return publicUrl;
  } catch {
    return null;
  }
}

export async function parseInstagram(url: string): Promise<FetchResult> {
  const [embedContent, instagramImages] = await Promise.all([
    fetchInstagramEmbed(url),
    fetchInstagramImages(url),
  ]);

  const imageUrl = instagramImages[0] ?? null;
  const imageSource: ImageSource = imageUrl ? "instagram_embed" : "none";

  if (embedContent.length > 200) {
    return {
      content: embedContent,
      imageUrl,
      imageCandidates: instagramImages,
      parsedVia: "instagram_caption",
      imageSource,
    };
  }

  // Embed failed — fall back to Perplexity with strict prompt
  if (process.env.PERPLEXITY_API_KEY) {
    const content = await fetchViaPerplexity(url, { kind: "instagram" });
    if (content.includes("Unable to access")) {
      return {
        content: "",
        imageUrl: null,
        imageCandidates: [],
        parsedVia: "none",
        imageSource: "none",
        error:
          "Instagram posts require login and cannot be parsed automatically. Please add the recipe manually.",
      };
    }
    return {
      content,
      imageUrl,
      imageCandidates: instagramImages,
      parsedVia: "instagram_perplexity",
      imageSource,
    };
  }

  return {
    content: "",
    imageUrl: null,
    imageCandidates: [],
    parsedVia: "none",
    imageSource: "none",
    error: "Instagram posts cannot be parsed automatically. Please add the recipe manually.",
  };
}
