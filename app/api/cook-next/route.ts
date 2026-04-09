/**
 * GET /api/cook-next
 * Returns 2 library recipes to cook next, based on:
 * - Current season (or all_year)
 * - Not shown in the last 7 days
 * - Not previously thumbs-down'd
 * Accepts optional ?exclude=id1,id2 to exclude specific recipe IDs (for replacement)
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function getCurrentSeason(): string {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const excludeIds = searchParams.get("exclude")?.split(",").filter(Boolean) ?? [];

  const { data: membership } = await supabase
    .from("galley_members")
    .select("galley_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return NextResponse.json({ recipes: [] });

  const galleyId = membership.galley_id;
  const season = getCurrentSeason();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Get recently shown and thumbs-down'd recipe IDs separately
  const { data: history } = await supabase
    .from("cook_next_history")
    .select("recipe_id, vote")
    .eq("galley_id", galleyId)
    .or(`shown_at.gte.${sevenDaysAgo},vote.eq.-1`);

  const recentlyShownIds = (history ?? [])
    .filter((h) => h.vote !== -1)
    .map((h) => h.recipe_id);
  const thumbsDownIds = (history ?? [])
    .filter((h) => h.vote === -1)
    .map((h) => h.recipe_id);

  // Primary exclusion: recently shown + thumbs-downed + caller-excluded
  const primaryExcluded = [...new Set([...excludeIds, ...recentlyShownIds, ...thumbsDownIds])];
  // Fallback exclusion: only permanently thumbs-downed (ignore recency)
  const fallbackExcluded = [...new Set([...excludeIds, ...thumbsDownIds])];

  // Get eligible recipes (matching season or all_year, not deleted)
  let query = supabase
    .from("recipes")
    .select("id, name, prep_time, servings, type, season, recipe_photos(*)")
    .eq("galley_id", galleyId)
    .is("deleted_at", null)
    .in("season", [season, "all_year"]);

  if (primaryExcluded.length > 0) {
    query = query.not("id", "in", `(${primaryExcluded.join(",")})`);
  }

  const { data: eligible } = await query;

  // If not enough seasonal recipes, fall back to all non-deleted recipes
  // (ignoring recency — only keep thumbs-down excluded)
  let pool = eligible ?? [];
  if (pool.length < 2) {
    let fallback = supabase
      .from("recipes")
      .select("id, name, prep_time, servings, type, season, recipe_photos(*)")
      .eq("galley_id", galleyId)
      .is("deleted_at", null);

    if (fallbackExcluded.length > 0) {
      fallback = fallback.not("id", "in", `(${fallbackExcluded.join(",")})`);
    }
    const { data: all } = await fallback;
    pool = all ?? [];
  }

  // Shuffle and pick 2
  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 2);

  // Log as shown
  if (shuffled.length > 0) {
    await supabase.from("cook_next_history").insert(
      shuffled.map((r) => ({ galley_id: galleyId, recipe_id: r.id }))
    );
  }

  return NextResponse.json({ recipes: shuffled, season });
}
