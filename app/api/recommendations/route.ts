/**
 * GET /api/recommendations
 * Manual trigger only — called when user taps "Start Discover".
 * Uses Perplexity to find new recipes from saved sources,
 * filtered against the discover_memory table.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { logAIUsage } from "@/lib/ai-logger";
import { logger } from "@/lib/logger";
import { checkRecsLimit } from "@/lib/rate-limit";
import { resolveActiveGalleyId } from "@/lib/active-galley";
import { getGalleyPlan } from "@/lib/subscription";

interface RecommendationResult {
  title: string;
  description: string;
  image_url: string | null;
  source_url: string;
  source_type: string;
  source_name: string;
}

interface PerplexityResponse {
  results: RecommendationResult[];
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  /**
   * Set when the upstream call failed in a way the client should know
   * about (HTTP non-2xx, network error). Lets the route return a 503 + a
   * "service unavailable" message instead of a misleading empty 200 that
   * the iOS UI renders as "Nothing matched".
   */
  serviceError?: boolean;
}

async function searchWithPerplexity(query: string): Promise<PerplexityResponse> {
  const empty: PerplexityResponse = { results: [], inputTokens: null, outputTokens: null, durationMs: 0 };
  if (!process.env.PERPLEXITY_API_KEY) return empty;

  const t0 = Date.now();
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        {
          role: "system",
          content: `You are a recipe discovery assistant. Return ONLY a valid JSON array of recipe recommendations.
Each item must have: title (string), description (1 sentence), image_url (direct image URL or null), source_url (direct URL to the specific recipe page), source_type ("instagram"|"youtube"|"website"), source_name (domain or account name).
Return exactly 6 results. No markdown, no explanation — only the JSON array.`,
        },
        { role: "user", content: query },
      ],
    }),
  });

  const durationMs = Date.now() - t0;
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    logger.warn("recommendations.perplexity.http_error", {
      status: res.status,
      body: body.slice(0, 300),
      durationMs,
    });
    return { ...empty, durationMs, serviceError: true };
  }

  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";
  const inputTokens: number | null = data.usage?.prompt_tokens ?? null;
  const outputTokens: number | null = data.usage?.completion_tokens ?? null;

  // Perplexity often wraps JSON in markdown code fences (```json ... ``` or
  // ``` ... ```). Strip them before regex-extracting the array so the parser
  // doesn't accidentally include the closing fence backticks.
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    const jsonMatch = stripped.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn("recommendations.perplexity.no_array", {
        sample: text.slice(0, 300),
      });
      return { results: [], inputTokens, outputTokens, durationMs };
    }
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      logger.warn("recommendations.perplexity.empty_array", {
        sample: text.slice(0, 300),
      });
      return { results: [], inputTokens, outputTokens, durationMs };
    }
    return { results: parsed, inputTokens, outputTokens, durationMs };
  } catch (err) {
    logger.warn("recommendations.perplexity.parse_failed", {
      error: err instanceof Error ? err.message : "unknown",
      sample: text.slice(0, 300),
    });
    return { results: [], inputTokens, outputTokens, durationMs };
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRecsLimit(user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const { searchParams } = new URL(request.url);
  const cuisine = searchParams.get("cuisine")?.trim() || null;
  const ingredient = searchParams.get("ingredient")?.trim() || null;

  const galleyId = await resolveActiveGalleyId(supabase, user.id);
  if (!galleyId) return NextResponse.json({ recommendations: [] });

  const plan = await getGalleyPlan(supabase, galleyId);
  if (plan !== "premium") {
    return NextResponse.json(
      { error: "AI recommendations are a premium feature.", upgrade: true },
      { status: 403 },
    );
  }

  // Load data in parallel — skip saved_sources for custom searches
  const [{ data: recipes }, { data: savedSources }, { data: memory }] = await Promise.all([
    supabase.from("recipes").select("name, type, season").eq("galley_id", galleyId).limit(30),
    cuisine || ingredient
      ? Promise.resolve({ data: null })
      : supabase.from("saved_sources").select("*").eq("galley_id", galleyId),
    supabase.from("discover_memory").select("url, title").eq("galley_id", galleyId),
  ]);

  const memoryUrls = (memory ?? []).map((m) => m.url);
  const memoryTitles = (memory ?? []).map((m) => m.title).filter(Boolean);

  const recipeContext = recipes && recipes.length > 0
    ? `This family's existing recipe collection includes: ${recipes.map((r) => r.name).slice(0, 15).join(", ")}. Find recipes that complement this collection — avoid duplicates.`
    : "Find popular family-friendly recipes.";

  const memoryContext = memoryUrls.length > 0
    ? `IMPORTANT: Do NOT include any of these previously rejected recipes: ${memoryTitles.slice(0, 10).join(", ")}. Also avoid these URLs: ${memoryUrls.slice(0, 10).join(", ")}.`
    : "";

  let searchQuery: string;
  if (cuisine || ingredient) {
    const filters = [
      cuisine ? `from ${cuisine} cuisine` : null,
      ingredient ? `featuring "${ingredient}" as a key ingredient` : null,
    ].filter(Boolean).join(" and ");
    searchQuery = `Find 6 new recipe recommendations ${filters}. ${recipeContext} ${memoryContext} Include direct URLs to specific recipe pages.`;
  } else {
    const sourceContext = savedSources && savedSources.length > 0
      ? `Search specifically on these sources: ${savedSources.map((s) => s.handle_or_name ?? s.url).join(", ")}.`
      : "Search popular cooking websites, Instagram food accounts, and YouTube cooking channels.";
    searchQuery = `${recipeContext} ${sourceContext} ${memoryContext} Find 6 new recipe recommendations with direct URLs to the specific recipe pages.`;
  }

  const { results, inputTokens, outputTokens, durationMs, serviceError } =
    await searchWithPerplexity(searchQuery);

  // Distinguish "upstream temporarily unavailable" (Perplexity 4xx/5xx —
  // billing exhausted, key revoked, outage) from "search returned nothing"
  // so the iOS empty state can show a useful message instead of the
  // misleading "Nothing matched". 503 is what the native client throws on,
  // which routes to a different toast.
  if (serviceError) {
    return NextResponse.json(
      {
        error: "Search service is temporarily unavailable. Please try again shortly.",
        retryable: true,
      },
      { status: 503 },
    );
  }

  await logAIUsage({
    userId: user.id,
    operation: "recommendation",
    model: "perplexity-sonar",
    inputTokens,
    outputTokens,
    durationMs,
    success: results.length > 0,
  });

  const recommendations = memoryUrls.length > 0
    ? results.filter((r) => !memoryUrls.includes(r.source_url))
    : results;

  logger.info("recommendations.search_completed", {
    userId: user.id,
    galleyId,
    cuisine,
    ingredient,
    perplexityResults: results.length,
    afterMemoryFilter: recommendations.length,
    memoryUrlCount: memoryUrls.length,
    durationMs,
    hasApiKey: Boolean(process.env.PERPLEXITY_API_KEY),
  });

  return NextResponse.json({ recommendations });
}
