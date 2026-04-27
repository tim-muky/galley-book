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
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSafeUrlAsync } from "@/lib/utils/url-validation";
import { logAIUsage } from "@/lib/ai-logger";
import { checkParseLimit } from "@/lib/rate-limit";
import { buildRecipePrompt, type ImageSource, type ParsedVia } from "@/lib/recipe-prompts";
import { fetchOEmbed } from "@/lib/oembed";
import { z } from "zod";

const ParseSchema = z.object({
  url: z.string().min(1).max(2000),
});

export const maxDuration = 60;

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
  const data = await fetchOEmbed("tiktok", url, 5000);
  if (!data) return { thumbnail: null, caption: "" };
  return {
    thumbnail: data.thumbnail_url?.startsWith("http") ? data.thumbnail_url : null,
    caption: data.title ?? "",
  };
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

/** Canonical watch URL — Perplexity and Gemini handle /watch?v= more reliably than /shorts/ */
function canonicalYouTubeUrl(url: string): string {
  const id = extractYouTubeVideoId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : url;
}

/** Scrape the YouTube watch page for the creator-written title and description.
 *  Many recipe creators put the full ingredient list and steps in the description —
 *  this is faster, cheaper, and more accurate than transcript / video / Perplexity routes.
 *  Falls back through 3 strategies because YouTube serves different page variants
 *  by region/UA/cookies (notably the EU consent gate which blanks the page on
 *  Frankfurt-region Vercel functions). */
async function fetchYouTubeWatchPageMeta(
  url: string
): Promise<{ title: string; description: string } | null> {
  const watchUrl = canonicalYouTubeUrl(url);
  // Pre-accept the EU consent gate so the watch page returns content rather
  // than the consent interstitial when called from EU serverless regions.
  const consentCookie = "CONSENT=YES+cb.20210328-17-p0.en+FX+000; SOCS=CAI";

  // Strategy 1+2: fetch the watch page, try the canonical JSON anchor first,
  // fall back to a direct string scrape of the embedded fields.
  try {
    const res = await fetch(`${watchUrl}&hl=en&persist_hl=1`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: consentCookie,
      },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const html = await res.text();

      // Strategy 1: parse ytInitialPlayerResponse JSON via balanced-brace extraction
      const player = extractYtInitialPlayer(html);
      if (player) {
        const details = player.videoDetails as Record<string, unknown> | undefined;
        if (details) {
          const title = typeof details.title === "string" ? details.title : "";
          const description = typeof details.shortDescription === "string" ? details.shortDescription : "";
          if (title || description) return { title, description };
        }
      }

      // Strategy 2: direct string scrape inside the videoDetails block — narrows
      // the search so we don't grab some unrelated short "title" field elsewhere
      // in the page (e.g. a button label).
      const decode = (s: string): string => {
        try { return JSON.parse(`"${s}"`) as string; } catch { return s; }
      };
      const detailsBlock = html.match(/"videoDetails":\s*(\{[\s\S]*?\})\s*,\s*"playerConfig"/);
      const detailsHtml = detailsBlock?.[1] ?? html;
      const titleMatch = detailsHtml.match(/"title":"((?:[^"\\]|\\.)*?)"/);
      const descMatch = detailsHtml.match(/"shortDescription":"((?:[^"\\]|\\.)*?)"/);
      if (titleMatch || descMatch) {
        const title = titleMatch ? decode(titleMatch[1]) : "";
        const description = descMatch ? decode(descMatch[1]) : "";
        if (title || description) return { title, description };
      }
    }
  } catch {
    // Fall through to oEmbed
  }

  // Strategy 3: oEmbed for the title only — public, no auth, never gated.
  // Useful as a last-resort so the title is still available to enrich
  // transcript / Perplexity content downstream.
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.title === "string" && data.title) {
        return { title: data.title, description: "" };
      }
    }
  } catch {
    // Fall through
  }

  return null;
}

/** Extract `ytInitialPlayerResponse` from a YouTube watch-page HTML using
 *  balanced-brace parsing instead of a regex. The previous regex anchor
 *  (`};(?:var|</script>)` after a non-greedy match) was picking up the wrong
 *  closing brace — JSON.parse would succeed on a shorter unrelated config
 *  blob with no videoDetails, silently falling through. Confirmed via
 *  GAL-152 logs (10/10 production calls hit this failure mode). */
function extractYtInitialPlayer(html: string): Record<string, unknown> | null {
  const idx = html.indexOf("ytInitialPlayerResponse");
  if (idx < 0) return null;
  const start = html.indexOf("{", idx);
  if (start < 0) return null;
  let depth = 0;
  let i = start;
  let inStr = false;
  let esc = false;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === "\"") { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  if (depth !== 0) return null;
  try {
    return JSON.parse(html.slice(start, i)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Resolve with the first non-null result from a list of promises, or null
 *  if all resolve to null. Used to race independent fallback strategies and
 *  return whichever produces usable content first. */
async function firstUsable<T>(promises: Promise<T | null>[]): Promise<T | null> {
  return new Promise((resolve) => {
    let pending = promises.length;
    if (pending === 0) {
      resolve(null);
      return;
    }
    let settled = false;
    for (const p of promises) {
      p.then((value) => {
        if (settled) return;
        if (value !== null && value !== undefined) {
          settled = true;
          resolve(value);
          return;
        }
        pending -= 1;
        if (pending === 0 && !settled) {
          settled = true;
          resolve(null);
        }
      }).catch(() => {
        if (settled) return;
        pending -= 1;
        if (pending === 0 && !settled) {
          settled = true;
          resolve(null);
        }
      });
    }
  });
}

/** Heuristic — does this YouTube description look like it contains a real recipe?
 *  Recipe descriptions usually have ingredient amounts (numbers + units) and either
 *  a list-style structure or step keywords. We use this to decide whether the
 *  description is rich enough to skip transcript/video/Perplexity. */
function descriptionLooksLikeRecipe(description: string): boolean {
  if (description.length < 150) return false;
  // Numbered or bulleted list lines — characteristic of ingredient/step lists
  const listLines = (description.match(/^\s*(?:[-•*]|\d+[.)])\s+/gm) ?? []).length;
  // Quantity hints — number adjacent to a unit (works in EN + DE; fractions ½ ¼ etc count too)
  const quantities = (
    description.match(
      /(?:\b\d+(?:[.,/]\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])\s*(g|kg|ml|l|tsp|tbsp|tl|el|cup|cups|tasse|tassen|ounce|oz|lb|piece|pieces|st(?:k|ück)?|prise|clove|cloves|zehe|zehen|slice|handful|handvoll|stick)s?\b/gi
    ) ?? []
  ).length;
  // Mention of "ingredients" / "recipe" / "zutaten" headers is also a strong signal
  const hasRecipeHeader = /\b(ingredients?|recipe|zutaten|rezept|method|directions|instructions)\b/i.test(description);
  if (listLines >= 2 || quantities >= 2) return true;
  if (hasRecipeHeader && (listLines >= 1 || quantities >= 1)) return true;
  return false;
}

/** Fetch YouTube captions by scraping the watch page for caption tracks and
 *  fetching the timedtext JSON directly. Replaces the old `youtube-transcript`
 *  dep which broke when YouTube changed their endpoints. No external library —
 *  same consent-cookie strategy as fetchYouTubeWatchPageMeta. */
async function fetchYouTubeTranscript(url: string): Promise<string | null> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;
  const watchUrl = canonicalYouTubeUrl(url);
  const consentCookie = "CONSENT=YES+cb.20210328-17-p0.en+FX+000; SOCS=CAI";

  try {
    const pageRes = await fetch(`${watchUrl}&hl=en&persist_hl=1`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: consentCookie,
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();

    // Caption tracks live inside ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks[]
    const player = extractYtInitialPlayer(html);
    if (!player) return null;
    const captions = (player.captions as Record<string, unknown> | undefined)
      ?.playerCaptionsTracklistRenderer as Record<string, unknown> | undefined;
    const tracks = captions?.captionTracks as Array<Record<string, unknown>> | undefined;
    if (!tracks || tracks.length === 0) return null;

    // Pick best track: English manual first, then English auto-generated, then any English, then first available
    const isEn = (t: Record<string, unknown>) => /^en/i.test(String(t.languageCode ?? ""));
    const isAsr = (t: Record<string, unknown>) => String(t.kind ?? "") === "asr";
    const track =
      tracks.find((t) => isEn(t) && !isAsr(t)) ??
      tracks.find((t) => isEn(t)) ??
      tracks[0];
    const baseUrl = typeof track.baseUrl === "string" ? track.baseUrl : null;
    if (!baseUrl) return null;

    // Request fmt=json3 for clean JSON instead of XML.
    const trackUrl = baseUrl + (baseUrl.includes("fmt=") ? "" : "&fmt=json3");
    const captionsRes = await fetch(trackUrl, { signal: AbortSignal.timeout(5000) });
    if (!captionsRes.ok) return null;
    const data = (await captionsRes.json()) as {
      events?: Array<{ segs?: Array<{ utf8?: string }> }>;
    };
    const text = (data.events ?? [])
      .flatMap((e) => e.segs ?? [])
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 50) return null;
    return text.slice(0, 20000);
  } catch {
    return null;
  }
}

/** Ask Gemini to watch the YouTube video directly and extract the recipe */
async function analyzeYouTubeVideoWithGemini(url: string, timeoutMs = 25000): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await Promise.race([
    model.generateContent([
      { fileData: { mimeType: "video/mp4", fileUri: url } },
      { text: "Watch this cooking video and extract the full recipe. Return: recipe name, all ingredients with exact amounts and units, all preparation steps in order (one discrete action per step, do NOT merge into a single block), servings count, and total prep/cook time in minutes. Plain text only, no commentary." },
    ]),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini video analysis timeout")), timeoutMs)
    ),
  ]);
  return result.response.text();
}

/** Use Perplexity to search for recipe content — good for Instagram, JS-heavy pages.
 *  Retries once on 504/timeout — Perplexity is occasionally slow on the first call. */
async function fetchViaPerplexity(url: string, isInstagram: boolean): Promise<string> {
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  const shortcode = match?.[1] ?? "";

  // YouTube: Perplexity sonar can't watch videos, but it can find the recipe via web search
  // when given the canonical title/URL. Asking it to "fetch the URL" yields vague summaries.
  const youtube = !isInstagram && /youtube\.com|youtu\.be/i.test(url);
  const canonicalUrl = youtube ? canonicalYouTubeUrl(url) : url;

  const prompt = isInstagram
    ? `I need the EXACT recipe from this specific Instagram post only: ${url}
Post ID / shortcode: ${shortcode}
Do NOT return recipes from other posts or accounts.
Fetch this exact URL and extract ONLY the recipe shown in this specific post.
Return: recipe name, complete ingredient list with exact amounts and units, all preparation steps in order, servings, total prep/cook time.
If you cannot access this exact post, say "Unable to access this Instagram post" and nothing else.`
    : youtube
    ? `Find the recipe from this YouTube video: ${canonicalUrl}
Search the web (creator's blog, video description, third-party transcripts) for the SAME recipe shown in this specific video.
Return EVERY field below, each on its own labelled line:
- Recipe name:
- Servings:
- Total time (prep + cook, in minutes):
- Ingredients (one per line, with exact amounts and units):
- Steps (numbered, one discrete cooking action per step — do NOT merge into a single block):
If you cannot find the specific recipe from this video, return "Unable to find recipe" and nothing else.
No commentary, raw recipe content only.`
    : `Fetch this URL and return the full recipe content: ${url}
Include: recipe name, all ingredients with amounts and units, all preparation steps, servings, and prep time.
Return only the raw recipe content, no commentary.`;

  const callOnce = async (timeoutMs: number) => {
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
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res;
  };

  let res: Response;
  try {
    res = await callOnce(15000);
    // 504 from upstream → one quick retry
    if (res.status === 504) {
      res = await callOnce(15000);
    }
  } catch {
    // First-attempt timeout → one retry
    try {
      res = await callOnce(15000);
    } catch {
      return "";
    }
  }

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

  // YouTube: 1) watch-page description (free, fast, accurate when creator posts the recipe),
  // 2) transcript, 3) Gemini video analysis, 4) Perplexity fallback (web search by title).
  if (youtube) {
    // Community Posts, channel pages, etc. have no video ID — skip video-specific routes
    // to avoid Gemini video analysis timeout blowing the maxDuration budget.
    if (!extractYouTubeVideoId(url)) {
      if (process.env.PERPLEXITY_API_KEY) {
        const content = await fetchViaPerplexity(url, false);
        if (content.length > 200 && !content.startsWith("Unable to find recipe")) {
          return { content, imageUrl: null, imageCandidates: [], parsedVia: "youtube_perplexity", imageSource: "none" };
        }
      }
      return { content: `Recipe from: ${url}`, imageUrl: null, imageCandidates: [], parsedVia: "none", imageSource: "none" };
    }

    // Fetch thumbnails, watch-page meta, and transcript in parallel — cheapest first wins.
    const [thumbnails, watchMeta, transcript] = await Promise.all([
      extractYouTubeThumbnails(url),
      fetchYouTubeWatchPageMeta(url),
      fetchYouTubeTranscript(url),
    ]);
    const imageUrl = thumbnails[0] ?? null;
    const imageSource: ImageSource = imageUrl ? "youtube_thumbnail" : "none";

    // Route 1: watch-page description — many recipe creators post the full recipe here.
    // Fast (~1s), free, deterministic — by far the best signal when present.
    if (watchMeta && descriptionLooksLikeRecipe(watchMeta.description)) {
      const content = `Title: ${watchMeta.title}\n\nDescription:\n${watchMeta.description}`;
      return { content, imageUrl, imageCandidates: thumbnails, parsedVia: "youtube_description", imageSource };
    }

    // Route 2: transcript — most videos have captions, near-zero cost
    if (transcript && transcript.length > 200) {
      // Prepend the title so the model has a confident dish name even if the transcript starts mid-sentence
      const titleLine = watchMeta?.title ? `Title: ${watchMeta.title}\n\n` : "";
      return { content: `${titleLine}${transcript}`, imageUrl, imageCandidates: thumbnails, parsedVia: "youtube_transcript", imageSource };
    }

    // Routes 3+4: race Gemini-video and Perplexity in parallel — whichever
    // returns a usable result first wins. Cuts ~10–15s off the worst case
    // versus running them sequentially. We pay for both calls when neither
    // path is dominant; acceptable trade since most cases hit the description
    // / transcript path now and never reach this branch.
    const titleLine = watchMeta?.title ? `Title: ${watchMeta.title}\n\n` : "";
    const hasPerplexity = !!process.env.PERPLEXITY_API_KEY;

    const videoPromise: Promise<{ via: ParsedVia; content: string } | null> =
      analyzeYouTubeVideoWithGemini(canonicalYouTubeUrl(url))
        .then((c) => (c.length > 200 ? { via: "youtube_video" as ParsedVia, content: c } : null))
        .catch(() => null);

    const perplexityPromise: Promise<{ via: ParsedVia; content: string } | null> = hasPerplexity
      ? fetchViaPerplexity(url, false)
          .then((c) =>
            c.length > 200 && !c.startsWith("Unable to find recipe")
              ? { via: "youtube_perplexity" as ParsedVia, content: `${titleLine}${c}` }
              : null
          )
          .catch(() => null)
      : Promise.resolve(null);

    const winner = await firstUsable([videoPromise, perplexityPromise]);
    if (winner) {
      return {
        content: winner.content,
        imageUrl,
        imageCandidates: thumbnails,
        parsedVia: winner.via,
        imageSource,
      };
    }

    return {
      content: "",
      imageUrl,
      imageCandidates: thumbnails,
      parsedVia: "none",
      imageSource,
      error: "Could not extract a recipe from this YouTube video. The description has no recipe text and the video has no usable captions. Try pasting the recipe manually.",
    };
  }

  // TikTok: oEmbed for thumbnail + caption, Perplexity for full recipe content
  if (isTikTokUrl(url)) {
    if (!/\/video\/\d+/.test(url)) {
      return {
        content: "",
        imageUrl: null,
        imageCandidates: [],
        parsedVia: "none",
        imageSource: "none",
        error: "Please share a specific TikTok video, not a profile page. Tap share on a video and copy that link.",
      };
    }
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

  // SSRF guard — reject private IPs, loopback, cloud metadata endpoints,
  // non-HTTP schemes, and any hostname whose DNS resolves to private space
  // (defends against DNS rebinding).
  if (!(await isSafeUrlAsync(url.trim()))) {
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

    // Perplexity-route results sometimes pass the upstream length check but
    // contain only a vague summary that the conservative prompt correctly
    // rejects (name=null + empty arrays). Returning that as success leaves
    // the user with a blank form — surface it as an explicit failure instead.
    const isPerplexityRoute =
      parsedVia === "youtube_perplexity" ||
      parsedVia === "instagram_perplexity" ||
      parsedVia === "perplexity";
    const hasNoRecipeContent =
      !parsed.name &&
      (!Array.isArray(parsed.ingredients) || parsed.ingredients.length === 0) &&
      (!Array.isArray(parsed.steps) || parsed.steps.length === 0);
    if (isPerplexityRoute && hasNoRecipeContent) {
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
        {
          error:
            "Could not extract a recipe from this URL. Web search returned only a summary, not the actual recipe. Try pasting it manually.",
        },
        { status: 422 }
      );
    }

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
