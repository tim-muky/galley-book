import { fetchOEmbed } from "@/lib/oembed";
import type { FetchResult, ImageSource } from "./types";
import { fetchViaPerplexity } from "./perplexity";

export function isTikTokUrl(url: string): boolean {
  return /tiktok\.com/i.test(url);
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

export async function parseTikTok(url: string): Promise<FetchResult> {
  if (!/\/video\/\d+/.test(url)) {
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
