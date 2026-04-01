/**
 * POST /api/recipes/parse
 *
 * Accepts a URL (Instagram, YouTube, website) and uses Claude to extract
 * structured recipe data from the page content.
 *
 * - Instagram/YouTube: uses Perplexity sonar (web search) to retrieve content
 * - Regular websites: direct fetch + og:image extraction
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const RECIPE_SCHEMA = `{
  "name": "string",
  "description": "string (brief, max 2 sentences)",
  "servings": number,
  "prep_time": number (in minutes),
  "season": "all_year" | "spring" | "summer" | "autumn" | "winter",
  "type": "starter" | "main" | "dessert" | "breakfast" | "snack" | "drink" | "side",
  "image_url": "string | null (direct image URL if found)",
  "ingredients": [{ "name": "string", "amount": number | null, "unit": "string | null" }],
  "steps": [{ "instruction": "string" }]
}`;

function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(p|reel|tv)\//i.test(url);
}

function isYouTubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url);
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
      model: "sonar-pro",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    // fallback to sonar if sonar-pro fails
    const res2 = await fetch("https://api.perplexity.ai/chat/completions", {
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
    if (res2.ok) {
      const data = await res2.json();
      return data.choices?.[0]?.message?.content ?? "";
    }
    return "";
  }

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

  // Instagram: try public embed URL first (contains actual caption/recipe)
  if (instagram) {
    const embedContent = await fetchInstagramEmbed(url);
    if (embedContent.length > 200) {
      return { content: embedContent, imageUrl: null };
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
      return { content, imageUrl: null };
    }
    return {
      content: "",
      imageUrl: null,
      error: "Instagram posts cannot be parsed automatically. Please add the recipe manually.",
    };
  }

  // YouTube: use Perplexity
  if (youtube && process.env.PERPLEXITY_API_KEY) {
    const content = await fetchViaPerplexity(url, false);
    return { content, imageUrl: null };
  }

  // Regular websites: try Perplexity first (gets cleaner content), then direct fetch
  if (process.env.PERPLEXITY_API_KEY) {
    try {
      const content = await fetchViaPerplexity(url, false);
      if (content.length > 200) {
        // Also try direct fetch to get the og:image
        let imageUrl: string | null = null;
        try {
          const htmlRes = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; GalleyBook/1.0; +https://galleybook.com)" },
            signal: AbortSignal.timeout(8000),
          });
          if (htmlRes.ok) {
            const html = await htmlRes.text();
            imageUrl = extractImageUrl(html);
          }
        } catch {
          // Image extraction failed, continue without it
        }
        return { content, imageUrl };
      }
    } catch {
      // Perplexity failed, fall through to direct fetch
    }
  }

  // Direct fetch fallback
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GalleyBook/1.0; +https://galleybook.com)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const imageUrl = extractImageUrl(html);

    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 15000);

    return { content: text, imageUrl };
  } catch {
    return { content: `Recipe from: ${url}`, imageUrl: null };
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url } = await request.json();
  if (!url?.trim()) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
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

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Extract the recipe from the following content and return ONLY valid JSON matching this schema:
${RECIPE_SCHEMA}

Rules:
- Convert all ingredient amounts to numbers (e.g. "½" → 0.5, "1/3" → 0.33)
- Unit should be one of: g, kg, ml, l, tsp, tbsp, cup, piece, pinch, slice, clove, handful, "to taste", or null
- prep_time: total active + passive cooking time in minutes
- season: infer from dish characteristics if not stated
- type: infer from dish if not stated (default "main")
- image_url: set to ${imageUrl ? `"${imageUrl}"` : "null"} (use this value as-is)
- Return null for fields you cannot determine
- Return ONLY JSON, no markdown, no explanation

Content:
${pageContent}`,
      },
    ],
  });

  const rawText =
    message.content[0].type === "text" ? message.content[0].text : "";

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
