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

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

const RECIPE_SCHEMA = `{
  "name": "string",
  "description": "string (brief, max 2 sentences)",
  "servings": number,
  "prep_time": number (in minutes),
  "season": "all_year" | "spring" | "summer" | "autumn" | "winter",
  "type": "starter" | "main" | "dessert" | "breakfast" | "snack" | "drink" | "side",
  "image_url": "string | null (direct image URL if found)",
  "ingredients": [{ "name": "string", "amount": number | null, "unit": "string | null", "group": "string | null" }],
  "steps": [{ "instruction": "string" }]
}`;

function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(p|reel|tv)\//i.test(url);
}

function isYouTubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url);
}

function isTikTokUrl(url: string): boolean {
  return /tiktok\.com/i.test(url);
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
    if (match?.[1] && match[1].startsWith("http")) {
      return match[1];
    }
  }
  return null;
}

/** YouTube thumbnail — fully public, no API key needed */
function extractYouTubeThumbnail(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) {
      return `https://img.youtube.com/vi/${m[1]}/maxresdefault.jpg`;
    }
  }
  return null;
}

/** Instagram thumbnail — tries oEmbed API first, then embed HTML scrape */
async function fetchInstagramThumbnail(url: string): Promise<string | null> {
  // 1. oEmbed endpoint (public, works for public posts without any auth)
  try {
    const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}&fields=thumbnail_url`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data.thumbnail_url?.startsWith("http")) return data.thumbnail_url;
    }
  } catch {
    // Fall through
  }

  // 2. Scrape embed HTML for CDN image URLs
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  if (!match) return null;
  const shortcode = match[1];

  for (const embedUrl of [
    `https://www.instagram.com/reel/${shortcode}/embed/`,
    `https://www.instagram.com/p/${shortcode}/embed/`,
  ]) {
    try {
      const res = await fetch(embedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const html = await res.text();

      // og:image in embed (most reliable)
      const ogImg = extractImageUrl(html);
      if (ogImg) return ogImg;

      // CDN image src in embed HTML
      const cdnMatch = html.match(/src=["'](https:\/\/[^"']+(?:cdninstagram|fbcdn)[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)/i);
      if (cdnMatch?.[1]) return cdnMatch[1];
    } catch {
      continue;
    }
  }
  return null;
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

  const yld = jsonLd.recipeYield;
  if (yld) lines.push(`Yield: ${Array.isArray(yld) ? yld[0] : yld}`);

  const totalTime = jsonLd.totalTime ?? jsonLd.cookTime ?? jsonLd.prepTime;
  if (totalTime) lines.push(`Total time: ${totalTime}`);

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
  if (typeof img === "string") return img.startsWith("http") ? img : null;
  if (Array.isArray(img) && img.length > 0) {
    const first = img[0];
    if (typeof first === "string") return first.startsWith("http") ? first : null;
    if (first && typeof first === "object") {
      const url = (first as Record<string, unknown>).url;
      return typeof url === "string" && url.startsWith("http") ? url : null;
    }
  }
  if (typeof img === "object") {
    const url = (img as Record<string, unknown>).url;
    return typeof url === "string" && url.startsWith("http") ? url : null;
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

/** Fetch YouTube captions via the public timedtext endpoint — no API key needed */
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
  const result = await model.generateContent([
    {
      fileData: {
        mimeType: "video/mp4",
        fileUri: url,
      },
    },
    {
      text: "Watch this cooking video and extract the full recipe. Return: recipe name, all ingredients with exact amounts and units, all preparation steps in order, servings count, and total prep/cook time. Plain text only, no commentary.",
    },
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
  });

  if (!res.ok) return "";

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

interface FetchResult {
  content: string;
  imageUrl: string | null;
  error?: string;
}

async function fetchPageContent(url: string): Promise<FetchResult> {
  const instagram = isInstagramUrl(url);
  const youtube = isYouTubeUrl(url);

  // Instagram: fetch thumbnail in parallel with content extraction
  if (instagram) {
    const [embedContent, thumbnailUrl] = await Promise.all([
      fetchInstagramEmbed(url),
      fetchInstagramThumbnail(url),
    ]);

    if (embedContent.length > 200) {
      return { content: embedContent, imageUrl: thumbnailUrl };
    }
    // Embed failed — fall back to Perplexity with strict prompt
    if (process.env.PERPLEXITY_API_KEY) {
      const content = await fetchViaPerplexity(url, true);
      if (content.includes("Unable to access")) {
        return {
          content: "",
          imageUrl: null,
          error: "Instagram posts require login and cannot be parsed automatically. Please add the recipe manually.",
        };
      }
      return { content, imageUrl: thumbnailUrl };
    }
    return {
      content: "",
      imageUrl: null,
      error: "Instagram posts cannot be parsed automatically. Please add the recipe manually.",
    };
  }

  // YouTube: 1) transcript (free, no key), 2) Gemini video analysis, 3) Perplexity fallback
  if (youtube) {
    const thumbnailUrl = extractYouTubeThumbnail(url);

    // Route 1: transcript — most videos have captions, near-zero cost
    const transcript = await fetchYouTubeTranscript(url);
    if (transcript && transcript.length > 200) {
      return { content: transcript, imageUrl: thumbnailUrl };
    }

    // Route 2: Gemini watches the video directly — handles videos without captions
    try {
      const videoContent = await analyzeYouTubeVideoWithGemini(url);
      if (videoContent.length > 200) {
        return { content: videoContent, imageUrl: thumbnailUrl };
      }
    } catch {
      // Fall through to Perplexity
    }

    // Route 3: Perplexity web search fallback
    if (process.env.PERPLEXITY_API_KEY) {
      const content = await fetchViaPerplexity(url, false);
      return { content, imageUrl: thumbnailUrl };
    }

    return { content: `Recipe from: ${url}`, imageUrl: thumbnailUrl };
  }

  // TikTok: oEmbed for thumbnail + caption, Perplexity for full recipe content
  if (isTikTokUrl(url)) {
    const [{ thumbnail: thumbnailUrl, caption }, perplexityContent] = await Promise.all([
      fetchTikTokOEmbed(url),
      process.env.PERPLEXITY_API_KEY ? fetchViaPerplexity(url, false) : Promise.resolve(""),
    ]);
    // Combine oEmbed caption (often contains the recipe text) with Perplexity output
    const content = [caption, perplexityContent].filter(Boolean).join("\n\n");
    return { content: content || `Recipe from TikTok: ${url}`, imageUrl: thumbnailUrl };
  }

  // Regular websites: always do a direct fetch first — JSON-LD gives us exact structured data
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GalleyBook/1.0; +https://galleybook.com)" },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const html = await res.text();
      const ogImageUrl = extractImageUrl(html);
      const jsonLd = extractJsonLd(html);

      if (jsonLd) {
        // JSON-LD found — exact structured data, preferred over everything else
        const jsonLdImage = extractJsonLdImage(jsonLd);
        return { content: formatJsonLdForModel(jsonLd), imageUrl: jsonLdImage ?? ogImageUrl };
      }

      // No JSON-LD: try Perplexity for cleaner content on JS-heavy pages
      if (process.env.PERPLEXITY_API_KEY) {
        try {
          const perplexityContent = await fetchViaPerplexity(url, false);
          if (perplexityContent.length > 200) {
            return { content: perplexityContent, imageUrl: ogImageUrl };
          }
        } catch { /* fall through to stripped HTML */ }
      }

      // Last resort: strip HTML tags
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 15000);
      return { content: text, imageUrl: ogImageUrl };
    }
  } catch { /* fall through */ }

  // Network error — try Perplexity as last resort
  if (process.env.PERPLEXITY_API_KEY) {
    try {
      const content = await fetchViaPerplexity(url, false);
      if (content.length > 200) return { content, imageUrl: null };
    } catch { /* give up */ }
  }

  return { content: `Recipe from: ${url}`, imageUrl: null };
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

  const { url } = await request.json();
  if (!url?.trim()) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  // SSRF guard — reject private IPs, loopback, cloud metadata endpoints, non-HTTP schemes
  if (!isSafeUrl(url.trim())) {
    return NextResponse.json({ error: "Invalid or disallowed URL." }, { status: 400 });
  }

  const { content: pageContent, imageUrl, error: fetchError } = await fetchPageContent(url);

  if (fetchError) {
    return NextResponse.json({ error: fetchError }, { status: 422 });
  }

  if (!pageContent?.trim()) {
    return NextResponse.json(
      { error: "Could not retrieve content from this URL. Try pasting the recipe manually." },
      { status: 422 }
    );
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(
    `Extract the recipe from the following content and return ONLY valid JSON matching this schema:
${RECIPE_SCHEMA}

Rules:
- Convert all ingredient amounts to numbers (e.g. "½" → 0.5, "1/3" → 0.33)
- Unit should be one of: g, kg, ml, l, tsp, tbsp, cup, piece, pinch, slice, clove, handful, "to taste", or null
- prep_time: total active + passive cooking time in minutes
- season: infer from dish characteristics if not stated
- type: infer from dish if not stated (default "main")
- image_url: set to ${imageUrl ? `"${imageUrl}"` : "null"} (use this value as-is)
- ingredients.group: if ingredients are divided into sections (e.g. "Marinade", "Sauce", "Dressing"), set group to the section name; otherwise null
- Return null for fields you cannot determine
- Return ONLY JSON, no markdown, no explanation

Content:
${pageContent}`
  );

  const rawText = result.response.text();

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const parsed = JSON.parse(jsonMatch[0]);
    // Ensure image_url is set from our extraction if Claude didn't include it
    if (!parsed.image_url && imageUrl) {
      parsed.image_url = imageUrl;
    }
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json(
      { error: "Could not parse recipe from this URL. Try pasting the recipe manually." },
      { status: 422 }
    );
  }
}
