/**
 * POST /api/recipes/parse
 *
 * Accepts a URL (Instagram, YouTube, website) and uses Gemini to extract
 * structured recipe data from the page content.
 *
 * - Instagram/YouTube: uses Perplexity sonar (web search) to retrieve content
 * - Regular websites: direct fetch + og:image extraction
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { YoutubeTranscript } from "youtube-transcript";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSafeUrl } from "@/lib/utils/url-validation";
import { logAIUsage } from "@/lib/ai-logger";
import { checkParseLimit } from "@/lib/rate-limit";
import { buildRecipePrompt, type ImageSource, type ParsedVia } from "@/lib/recipe-prompts";
import { z } from "zod";

const ParseSchema = z.object({
  url: z.string().min(1).max(2000),
});

export const maxDuration = 30;

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(p|reel|tv)\//i.test(url);
}

function isYouTubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url);
}

function isTikTokUrl(url: string): boolean {
  return /tiktok\.com/i.test(url);
}

/** Normalize protocol-relative URLs to https */
function normalizeImageUrl(raw: string): string | null {
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("http")) return raw;
  return null;
}

/** Extract og:image or twitter:image from raw HTML */
function extractImageUrl(html: string): string | null {
  const patterns = [
    /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    /name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const normalized = normalizeImageUrl(match[1]);
      if (normalized) return normalized;
    }
  }
  return null;
}

/** YouTube thumbnails — validates each variant, returns cover + up to 3 snapshot frames */
async function extractYouTubeThumbnails(url: string): Promise<string[]> {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  let videoId: string | null = null;
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) { videoId = m[1]; break; }
  }
  if (!videoId) return [];

  // Cover frame quality variants (creator-chosen thumbnail at different resolutions)
  const coverVariants = ["maxresdefault", "sddefault", "hqdefault", "0"];
  // Auto-generated snapshot frames at ~25%, ~50%, ~75% through the video
  const snapshotVariants = ["1", "2", "3"];

  const id = videoId;
  const allUrls = [
    ...coverVariants.map((v) => `https://img.youtube.com/vi/${id}/${v}.jpg`),
    ...snapshotVariants.map((v) => `https://img.youtube.com/vi/${id}/${v}.jpg`),
  ];

  const results = await Promise.allSettled(
    allUrls.map(async (thumbUrl) => {
      const res = await fetch(thumbUrl, { method: "HEAD", signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error("not found");
      return thumbUrl;
    })
  );

  const valid = results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value);

  // Take best available cover quality (first valid from coverVariants), then snapshots
  const coverUrl = valid.find((u) =>
    coverVariants.some((v) => u.endsWith(`/${v}.jpg`))
  );
  const snapshots = valid.filter((u) => snapshotVariants.some((v) => u.endsWith(`/${v}.jpg`)));

  return [coverUrl, ...snapshots].filter((u): u is string => !!u);
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

/** Download an image and return base64 + mime so it can be passed as Gemini inlineData.
 *  Cap at 5 MB to keep us inside model + lambda limits. */
async function fetchInlineImage(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const isInstagramCdn = url.includes("cdninstagram.com") || url.includes("fbcdn.net");
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GalleyBook/1.0; +https://galleybook.com)",
        ...(isInstagramCdn ? { Referer: "https://www.instagram.com/" } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > 5 * 1024 * 1024) return null;
    const mimeType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];
    return { data: Buffer.from(buffer).toString("base64"), mimeType };
  } catch {
    return null;
  }
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

/** Extract Schema.org Recipe from JSON-LD script tags */
function extractJsonLd(html: string): Record<string, unknown> | null {
  const scriptMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scriptMatches) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const type = (item as Record<string, unknown>)["@type"];
        if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) {
          return item as Record<string, unknown>;
        }
        // Some sites wrap recipes in @graph
        const graph = (item as Record<string, unknown>)["@graph"];
        if (Array.isArray(graph)) {
          const recipe = graph.find((g) => {
            const t = (g as Record<string, unknown>)["@type"];
            return t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"));
          });
          if (recipe) return recipe as Record<string, unknown>;
        }
      }
    } catch { continue; }
  }
  return null;
}

/** Serialize JSON-LD Recipe into clean structured text for the model */
function formatJsonLdForModel(jsonLd: Record<string, unknown>): string {
  const lines: string[] = [];

  if (jsonLd.name) lines.push(`Recipe: ${jsonLd.name}`);
  if (jsonLd.description) {
    const desc = jsonLd.description;
    lines.push(`Description: ${typeof desc === "string" ? desc : JSON.stringify(desc)}`);
  }
  if (jsonLd.recipeCuisine) lines.push(`Cuisine: ${jsonLd.recipeCuisine}`);
  if (jsonLd.keywords) lines.push(`Keywords: ${jsonLd.keywords}`);
  if (jsonLd.recipeCategory) lines.push(`Category: ${jsonLd.recipeCategory}`);

  const yld = jsonLd.recipeYield;
  if (yld) lines.push(`Yield: ${Array.isArray(yld) ? yld[0] : yld}`);

  if (jsonLd.prepTime) lines.push(`Prep time: ${jsonLd.prepTime}`);
  if (jsonLd.cookTime) lines.push(`Cook time: ${jsonLd.cookTime}`);
  if (jsonLd.totalTime) lines.push(`Total time: ${jsonLd.totalTime}`);

  const ingredients = jsonLd.recipeIngredient;
  if (Array.isArray(ingredients) && ingredients.length > 0) {
    lines.push("\nIngredients:");
    for (const ing of ingredients) lines.push(`- ${ing}`);
  }

  const instructions = jsonLd.recipeInstructions;
  if (Array.isArray(instructions) && instructions.length > 0) {
    lines.push("\nInstructions:");
    for (const step of instructions) {
      if (typeof step === "string") {
        lines.push(`- ${step}`);
      } else if (step && typeof step === "object") {
        const s = step as Record<string, unknown>;
        if (s["@type"] === "HowToSection") {
          if (s.name) lines.push(`\n${s.name}:`);
          const sectionSteps = s.itemListElement;
          if (Array.isArray(sectionSteps)) {
            for (const ss of sectionSteps) {
              const sso = ss as Record<string, unknown>;
              lines.push(`- ${sso.text ?? sso.name ?? ""}`);
            }
          }
        } else {
          lines.push(`- ${s.text ?? s.name ?? ""}`);
        }
      }
    }
  }

  return lines.join("\n");
}

/** Extract image URL from JSON-LD Recipe image field */
function extractJsonLdImage(jsonLd: Record<string, unknown>): string | null {
  const img = jsonLd.image;
  if (!img) return null;
  if (typeof img === "string") return normalizeImageUrl(img);
  if (Array.isArray(img) && img.length > 0) {
    const first = img[0];
    if (typeof first === "string") return normalizeImageUrl(first);
    if (first && typeof first === "object") {
      const url = (first as Record<string, unknown>).url;
      return typeof url === "string" ? normalizeImageUrl(url) : null;
    }
  }
  if (typeof img === "object") {
    const url = (img as Record<string, unknown>).url;
    return typeof url === "string" ? normalizeImageUrl(url) : null;
  }
  return null;
}

/** TikTok thumbnail + caption — uses public oEmbed endpoint (no auth needed) */
async function fetchTikTokOEmbed(url: string): Promise<{ thumbnail: string | null; caption: string }> {
  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      return {
        thumbnail: data.thumbnail_url?.startsWith("http") ? (data.thumbnail_url as string) : null,
        caption: (data.title as string) ?? "",
      };
    }
  } catch {
    // Fall through
  }
  return { thumbnail: null, caption: "" };
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

/** Extract YouTube video ID from any YouTube URL format */
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Fetch YouTube captions via the public timedtext endpoint — no API key needed.
 *  Uses youtube-transcript@1.3.0 which relies on undocumented YouTube APIs.
 *  If this returns null more frequently, fall through to Gemini video analysis.
 *  Monitor via ai_usage_logs: high gemini parse_link count = transcript is broken.
 */
async function fetchYouTubeTranscript(url: string): Promise<string | null> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    if (!segments.length) return null;
    // Join into plain text, dropping timestamps — enough for recipe extraction
    return segments.map((s) => s.text).join(" ").slice(0, 20000);
  } catch {
    return null;
  }
}

/** Ask Gemini to watch the YouTube video directly and extract the recipe */
async function analyzeYouTubeVideoWithGemini(url: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await Promise.race([
    model.generateContent([
      { fileData: { mimeType: "video/mp4", fileUri: url } },
      { text: "Watch this cooking video and extract the full recipe. Return: recipe name, all ingredients with exact amounts and units, all preparation steps in order, servings count, and total prep/cook time. Plain text only, no commentary." },
    ]),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini video analysis timeout")), 20000)
    ),
  ]);
  return result.response.text();
}

/** Use Perplexity to search for recipe content — good for Instagram, YouTube, JS-heavy pages */
async function fetchViaPerplexity(url: string, isInstagram: boolean): Promise<string> {
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  const shortcode = match?.[1] ?? "";

  const prompt = isInstagram
    ? `I need the EXACT recipe from this specific Instagram post only: ${url}
Post ID / shortcode: ${shortcode}
Do NOT return recipes from other posts or accounts.
Fetch this exact URL and extract ONLY the recipe shown in this specific post.
Return: recipe name, complete ingredient list with exact amounts and units, all preparation steps in order, servings, total prep/cook time.
If you cannot access this exact post, say "Unable to access this Instagram post" and nothing else.`
    : `Fetch this URL and return the full recipe content: ${url}
Include: recipe name, all ingredients with amounts and units, all preparation steps, servings, and prep time.
Return only the raw recipe content, no commentary.`;

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) return "";

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

interface FetchResult {
  content: string;
  imageUrl: string | null;
  imageCandidates: string[];
  parsedVia: ParsedVia;
  imageSource: ImageSource;
  error?: string;
}

async function fetchPageContent(url: string): Promise<FetchResult> {
  const instagram = isInstagramUrl(url);
  const youtube = isYouTubeUrl(url);

  // Instagram: fetch images in parallel with content extraction
  if (instagram) {
    const [embedContent, instagramImages] = await Promise.all([
      fetchInstagramEmbed(url),
      fetchInstagramImages(url),
    ]);

    const imageUrl = instagramImages[0] ?? null;
    const imageSource: ImageSource = imageUrl ? "instagram_embed" : "none";
    if (embedContent.length > 200) {
      return { content: embedContent, imageUrl, imageCandidates: instagramImages, parsedVia: "instagram_caption", imageSource };
    }
    // Embed failed — fall back to Perplexity with strict prompt
    if (process.env.PERPLEXITY_API_KEY) {
      const content = await fetchViaPerplexity(url, true);
      if (content.includes("Unable to access")) {
        return {
          content: "",
          imageUrl: null,
          imageCandidates: [],
          parsedVia: "none",
          imageSource: "none",
          error: "Instagram posts require login and cannot be parsed automatically. Please add the recipe manually.",
        };
      }
      return { content, imageUrl, imageCandidates: instagramImages, parsedVia: "instagram_perplexity", imageSource };
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

  // YouTube: 1) transcript (free, no key), 2) Gemini video analysis, 3) Perplexity fallback
  if (youtube) {
    // Community Posts, channel pages, etc. have no video ID — skip video-specific routes
    // to avoid Gemini video analysis timeout blowing the 30 s maxDuration budget.
    if (!extractYouTubeVideoId(url)) {
      if (process.env.PERPLEXITY_API_KEY) {
        const content = await fetchViaPerplexity(url, false);
        if (content.length > 200) return { content, imageUrl: null, imageCandidates: [], parsedVia: "youtube_perplexity", imageSource: "none" };
      }
      return { content: `Recipe from: ${url}`, imageUrl: null, imageCandidates: [], parsedVia: "none", imageSource: "none" };
    }

    // Fetch all thumbnail candidates (cover + snapshot frames) in parallel with transcript
    const [thumbnails, transcript] = await Promise.all([
      extractYouTubeThumbnails(url),
      fetchYouTubeTranscript(url),
    ]);
    const imageUrl = thumbnails[0] ?? null;
    const imageSource: ImageSource = imageUrl ? "youtube_thumbnail" : "none";

    // Route 1: transcript — most videos have captions, near-zero cost
    if (transcript && transcript.length > 200) {
      return { content: transcript, imageUrl, imageCandidates: thumbnails, parsedVia: "youtube_transcript", imageSource };
    }

    // Route 2: Gemini watches the video directly — handles videos without captions
    try {
      const videoContent = await analyzeYouTubeVideoWithGemini(url);
      if (videoContent.length > 200) {
        return { content: videoContent, imageUrl, imageCandidates: thumbnails, parsedVia: "youtube_video", imageSource };
      }
    } catch {
      // Fall through to Perplexity
    }

    // Route 3: Perplexity web search fallback
    if (process.env.PERPLEXITY_API_KEY) {
      const content = await fetchViaPerplexity(url, false);
      return { content, imageUrl, imageCandidates: thumbnails, parsedVia: "youtube_perplexity", imageSource };
    }

    return { content: `Recipe from: ${url}`, imageUrl, imageCandidates: thumbnails, parsedVia: "none", imageSource };
  }

  // TikTok: oEmbed for thumbnail + caption, Perplexity for full recipe content
  if (isTikTokUrl(url)) {
    const [{ thumbnail: thumbnailUrl, caption }, perplexityContent] = await Promise.all([
      fetchTikTokOEmbed(url),
      process.env.PERPLEXITY_API_KEY ? fetchViaPerplexity(url, false) : Promise.resolve(""),
    ]);
    const imageCandidates = thumbnailUrl ? [thumbnailUrl] : [];
    const content = [caption, perplexityContent].filter(Boolean).join("\n\n");
    const imageSource: ImageSource = thumbnailUrl ? "tiktok_thumbnail" : "none";
    return { content: content || `Recipe from TikTok: ${url}`, imageUrl: thumbnailUrl, imageCandidates, parsedVia: "tiktok", imageSource };
  }

  // Regular websites: always do a direct fetch first — JSON-LD gives us exact structured data
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "de,en-US;q=0.8,en;q=0.5",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const html = await res.text();
      const ogImageUrl = extractImageUrl(html);
      const jsonLd = extractJsonLd(html);

      if (jsonLd) {
        const jsonLdImage = extractJsonLdImage(jsonLd);
        const imageUrl = jsonLdImage ?? ogImageUrl;
        const imageCandidates = imageUrl ? [imageUrl] : [];
        const imageSource: ImageSource = jsonLdImage ? "jsonld_image" : ogImageUrl ? "og_image" : "none";
        return { content: formatJsonLdForModel(jsonLd), imageUrl, imageCandidates, parsedVia: "jsonld", imageSource };
      }

      // No JSON-LD: try Perplexity for cleaner content on JS-heavy pages
      if (process.env.PERPLEXITY_API_KEY) {
        try {
          const perplexityContent = await fetchViaPerplexity(url, false);
          if (perplexityContent.length > 200) {
            const imageCandidates = ogImageUrl ? [ogImageUrl] : [];
            const imageSource: ImageSource = ogImageUrl ? "og_image" : "none";
            return { content: perplexityContent, imageUrl: ogImageUrl, imageCandidates, parsedVia: "perplexity", imageSource };
          }
        } catch { /* fall through to stripped HTML */ }
      }

      // Last resort: strip structural/noise elements, then tags
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
        .replace(/<template[^>]*>[\s\S]*?<\/template>/gi, "")
        .replace(/<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 15000);
      const imageCandidates = ogImageUrl ? [ogImageUrl] : [];
      const imageSource: ImageSource = ogImageUrl ? "og_image" : "none";
      return { content: text, imageUrl: ogImageUrl, imageCandidates, parsedVia: "html_text", imageSource };
    }
  } catch { /* fall through */ }

  // Network error — try Perplexity as last resort
  if (process.env.PERPLEXITY_API_KEY) {
    try {
      const content = await fetchViaPerplexity(url, false);
      if (content.length > 200) return { content, imageUrl: null, imageCandidates: [], parsedVia: "perplexity", imageSource: "none" };
    } catch { /* give up */ }
  }

  return { content: `Recipe from: ${url}`, imageUrl: null, imageCandidates: [], parsedVia: "none", imageSource: "none" };
}

/** Download an Instagram CDN image and re-host it in Supabase Storage.
 *
 * Instagram CDN URLs (cdninstagram.com / fbcdn.net) are signed and expire within
 * seconds to minutes. Fetching the same URL again at recipe-save time silently fails,
 * leaving recipes without photos. Caching at parse time gives us a stable URL that
 * survives the round-trip back to the client and the subsequent save call.
 */
async function cacheInstagramImage(
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

export async function POST(request: Request) {
  if (!process.env.GOOGLE_AI_API_KEY) {
    return NextResponse.json({ error: "Recipe parsing is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkParseLimit(user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const body = await request.json();
  const parsed = ParseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }
  const { url } = parsed.data;

  // SSRF guard — reject private IPs, loopback, cloud metadata endpoints, non-HTTP schemes
  if (!isSafeUrl(url.trim())) {
    return NextResponse.json({ error: "Invalid or disallowed URL." }, { status: 400 });
  }

  const { content: pageContent, imageUrl: rawImageUrl, imageCandidates: rawImageCandidates, parsedVia, imageSource, error: fetchError } = await fetchPageContent(url);

  if (fetchError) {
    return NextResponse.json({ error: fetchError }, { status: 422 });
  }

  if (!pageContent?.trim()) {
    return NextResponse.json(
      { error: "Could not retrieve content from this URL. Try pasting the recipe manually." },
      { status: 422 }
    );
  }

  // Instagram CDN URLs expire within seconds — re-fetching at save time silently fails.
  // Upload now so the parse response contains a stable Supabase URL.
  let imageUrl = rawImageUrl;
  let imageCandidates = rawImageCandidates;
  if (rawImageUrl && (rawImageUrl.includes("cdninstagram.com") || rawImageUrl.includes("fbcdn.net"))) {
    const cached = await cacheInstagramImage(rawImageUrl, user.id, supabase);
    if (cached) {
      imageUrl = cached;
      imageCandidates = [cached, ...rawImageCandidates.slice(1)];
    }
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // For Instagram captions (incl. reels) the spoken/written recipe is often thin.
  // Adding the cover-frame as a multimodal input lets Gemini infer dish type,
  // season, plating, and visible ingredients from the photo even when the
  // caption is terse. Cheapest meaningful boost for reel quality.
  const inlineImage =
    parsedVia === "instagram_caption" && imageUrl
      ? await fetchInlineImage(imageUrl)
      : null;
  const usedMultimodal = !!inlineImage;

  const promptText = buildRecipePrompt(parsedVia, pageContent, imageUrl, usedMultimodal);
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: promptText },
  ];
  if (inlineImage) {
    parts.push({ inlineData: { mimeType: inlineImage.mimeType, data: inlineImage.data } });
  }

  const t0 = Date.now();
  const result = await model.generateContent(parts);
  const duration = Date.now() - t0;
  const operationLabel = (
    usedMultimodal ? `parse_link:${parsedVia}+image` : `parse_link:${parsedVia}`
  ) as `parse_link:${string}`;

  const rawText = result.response.text();

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.image_url && imageUrl) {
      parsed.image_url = imageUrl;
    }
    parsed.image_candidates = imageCandidates;
    parsed.parsed_via = parsedVia;
    parsed.image_source = imageSource;
    await logAIUsage({
      userId: user.id,
      operation: operationLabel,
      model: "gemini-2.5-flash",
      inputTokens: result.response.usageMetadata?.promptTokenCount ?? null,
      outputTokens: result.response.usageMetadata?.candidatesTokenCount ?? null,
      durationMs: duration,
      success: true,
    });
    return NextResponse.json(parsed);
  } catch {
    await logAIUsage({
      userId: user.id,
      operation: operationLabel,
      model: "gemini-2.5-flash",
      inputTokens: result.response.usageMetadata?.promptTokenCount ?? null,
      outputTokens: result.response.usageMetadata?.candidatesTokenCount ?? null,
      durationMs: duration,
      success: false,
    });
    return NextResponse.json(
      { error: "Could not parse recipe from this URL. Try pasting the recipe manually." },
      { status: 422 }
    );
  }
}
