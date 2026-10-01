import { fetchOEmbed } from "@/lib/oembed";
import type { FetchResult, ImageSource } from "./types";
import { fetchViaPerplexity } from "./perplexity";

export function isTikTokUrl(url: string): boolean {
  return /tiktok\.com/i.test(url);
}

/** Short share links from the TikTok app ("Copy link") — vm./vt.tiktok.com/<code>
 *  and tiktok.com/t/<code>. They carry no video ID until redirected. */
export function isTikTokShortLink(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return (
      host === "vm.tiktok.com" ||
      host === "vt.tiktok.com" ||
      (/(^|\.)tiktok\.com$/.test(host) && u.pathname.startsWith("/t/"))
    );
  } catch {
    return false;
  }
}

/** Follow a short link's redirects to the canonical /@handle/video/<id> URL.
 *  Hops are followed manually and only while they stay on tiktok.com, so a
 *  crafted short link can't bounce the server to an arbitrary host (SSRF).
 *  Tracking params (_r, _t) are dropped. Returns the input unchanged on failure. */
export async function resolveTikTokShortLink(url: string): Promise<string> {
  if (!isTikTokShortLink(url)) return url;
  let current = url;
  for (let hop = 0; hop < 3; hop++) {
    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      return url;
    }
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) return url;
    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      return url;
    }
    if (next.protocol !== "https:" || !/(^|\.)tiktok\.com$/i.test(next.hostname)) return url;
    if (/\/video\/\d+/.test(next.pathname)) return `${next.origin}${next.pathname}`;
    current = next.toString();
  }
  return url;
}

/** TikTok thumbnail + caption — uses public oEmbed endpoint (no auth needed) */
async function fetchTikTokOEmbed(
  url: string
): Promise<{ thumbnail: string | null; caption: string }> {
  const data = await fetchOEmbed("tiktok", url, 5000);
  if (!data) return { thumbnail: null, caption: "" };
  return {
    thumbnail: data.thumbnail_url?.startsWith("http") ? data.thumbnail_url : null,
    caption: data.title ?? "",
  };
}

export async function parseTikTok(rawUrl: string): Promise<FetchResult> {
  const url = await resolveTikTokShortLink(rawUrl);
  if (!/\/video\/\d+/.test(url)) {
    if (isTikTokShortLink(rawUrl)) {
      return {
        content: "",
        imageUrl: null,
        imageCandidates: [],
        parsedVia: "none",
        imageSource: "none",
        error:
          "Couldn't open this TikTok link. It may be private or deleted — try opening it in TikTok and copying the link again.",
      };
    }
    return {
      content: "",
      imageUrl: null,
      imageCandidates: [],
      parsedVia: "none",
      imageSource: "none",
      error:
        "Please share a specific TikTok video, not a profile page. Tap share on a video and copy that link.",
    };
  }
  const [{ thumbnail: thumbnailUrl, caption }, perplexityContent] = await Promise.all([
    fetchTikTokOEmbed(url),
    process.env.PERPLEXITY_API_KEY
      ? fetchViaPerplexity(url, { kind: "generic" })
      : Promise.resolve(""),
  ]);
  const imageCandidates = thumbnailUrl ? [thumbnailUrl] : [];
  const content = [caption, perplexityContent].filter(Boolean).join("\n\n");
  const imageSource: ImageSource = thumbnailUrl ? "tiktok_thumbnail" : "none";
  return {
    content: content || `Recipe from TikTok: ${url}`,
    imageUrl: thumbnailUrl,
    imageCandidates,
    parsedVia: "tiktok",
    imageSource,
  };
}
