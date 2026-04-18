/**
 * GET /api/recommendations
 * Manual trigger only — called when user taps "Start Discover".
 * Uses Perplexity to find new recipes from saved sources,
 * filtered against the discover_memory table.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { logAIUsage } from "@/lib/ai-logger";

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
  if (!res.ok) return { ...empty, durationMs };

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  const inputTokens: number | null = data.usage?.prompt_tokens ?? null;
  const outputTokens: number | null = data.usage?.completion_tokens ?? null;

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { results: [], inputTokens, outputTokens, durationMs };
    return { results: JSON.parse(jsonMatch[0]), inputTokens, outputTokens, durationMs };
  } catch {
    return { results: [], inputTokens, outputTokens, durationMs };
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const cuisine = searchParams.get("cuisine")?.trim() || null;
  const ingredient = searchParams.get("ingredient")?.trim() || null;

  const { data: membership } = await supabase
    .from("galley_members")
    .select("galley_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return NextResponse.json({ recommendations: [] });

  const galleyId = membership.galley_id;

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

  const { results, inputTokens, outputTokens, durationMs } = await searchWithPerplexity(searchQuery);

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

  return NextResponse.json({ recommendations });
}
