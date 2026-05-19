import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GAL-333: discovery search across public galleys + recipes inside them.
// Authenticated only — no SEO/web exposure (project_paywall_gates).
//
// Query string: ?q=<term>
// Returns:
//   - galleys: matches on galley name (substring, case-insensitive)
//   - recipes: matches on recipe name (substring, case-insensitive),
//              limited to recipes in public galleys.
//
// v1 ranking is naive (most-recently-public first). Follower-count as a
// tiebreaker is left for v2 once we have meaningful counts.

export const dynamic = "force-dynamic";

const MAX_RESULTS = 30;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ galleys: [], recipes: [] });
  }

  // PostgREST ilike pattern; escape the standard wildcards so user-typed
  // % and _ don't expand the match scope.
  const escaped = q.replace(/[\\%_]/g, "\\$&");
  const pattern = `%${escaped}%`;

  const [galleysRes, recipesRes] = await Promise.all([
    supabase
      .from("galleys")
      .select("id, name, owner_id, public_since, header_image_path")
      .eq("is_public", true)
      .ilike("name", pattern)
      .order("public_since", { ascending: false })
      .limit(MAX_RESULTS),
    supabase
      .from("recipes")
      .select("id, name, galley_id, type, prep_time, galleys!inner(id, name, is_public)")
      .eq("galleys.is_public", true)
      .is("deleted_at", null)
      .ilike("name", pattern)
      .limit(MAX_RESULTS),
  ]);

  if (galleysRes.error || recipesRes.error) {
    return NextResponse.json(
      { error: (galleysRes.error ?? recipesRes.error)!.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    galleys: galleysRes.data ?? [],
    recipes: recipesRes.data ?? [],
  });
}
