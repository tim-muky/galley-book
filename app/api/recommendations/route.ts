/**
 * GET /api/recommendations
 * Manual trigger only — called when user taps "Start Discover".
 * Uses Perplexity to find new recipes from saved sources,
 * filtered against the discover_memory table.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function searchWithPerplexity(query: string): Promise<Array<{
  title: string;
  description: string;
  image_url: string | null;
  source_url: string;
  source_type: string;
  source_name: string;
}>> {
  if (!process.env.PERPLEXITY_API_KEY) return [];

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
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

  if (!res.ok) return [];
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("galley_members")
    .select("galley_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return NextResponse.json({ recommendations: [] });

  const galleyId = membership.galley_id;

  // Load data in parallel
  const [{ data: recipes }, { data: savedSources }, { data: memory }] = await Promise.all([
    supabase.from("recipes").select("name, type, season").eq("galley_id", galleyId).limit(30),
    supabase.from("saved_sources").select("*").eq("galley_id", galleyId),
    supabase.from("discover_memory").select("url, title").eq("galley_id", galleyId),
  ]);

  const memoryUrls = (memory ?? []).map((m) => m.url);
  const memoryTitles = (memory ?? []).map((m) => m.title).filter(Boolean);

  const recipeContext = recipes && recipes.length > 0
    ? `This family's existing recipe collection includes: ${recipes.map((r) => r.name).slice(0, 15).join(", ")}. Find recipes that complement this collection — avoid duplicates.`
    : "Find popular family-friendly recipes.";

  const sourceContext = savedSources && savedSources.length > 0
    ? `Search specifically on these sources: ${savedSources.map((s) => s.handle_or_name ?? s.url).join(", ")}.`
    : "Search popular cooking websites, Instagram food accounts, and YouTube cooking channels.";

  const memoryContext = memoryUrls.length > 0
    ? `IMPORTANT: Do NOT include any of these previously rejected recipes: ${memoryTitles.slice(0, 10).join(", ")}. Also avoid these URLs: ${memoryUrls.slice(0, 10).join(", ")}.`
    : "";

  const query = `${recipeContext} ${sourceContext} ${memoryContext} Find 6 new recipe recommendations with direct URLs to the specific recipe pages.`;

  let recommendations = await searchWithPerplexity(query);

  // Filter out memory URLs client-side as extra safety
  if (memoryUrls.length > 0) {
    recommendations = recommendations.filter((r) => !memoryUrls.includes(r.source_url));
  }

  return NextResponse.json({ recommendations });
}
