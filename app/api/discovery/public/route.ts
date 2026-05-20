import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GAL-333 + GAL-356: discovery across public galleys + recipes inside them.
// Authenticated only — no SEO/web exposure (project_paywall_gates).
//
// Query string: ?q=<term>
//   - q empty or 1 char  → return ALL public galleys (browse mode), no recipes
//   - q >= 2 chars       → galleys matching name + recipes matching name
// Each galley row carries owner avatar + recipe count for the list UI.

export const dynamic = "force-dynamic";

const MAX_RESULTS = 30;

type GalleyRow = {
  id: string;
  name: string;
  owner_id: string;
  public_since: string | null;
  header_image_path: string | null;
};

async function decorateGalleys(
  supabase: Awaited<ReturnType<typeof createClient>>,
  galleys: GalleyRow[],
) {
  if (galleys.length === 0) return [];

  const ownerIds = Array.from(new Set(galleys.map((g) => g.owner_id)));
  const galleyIds = galleys.map((g) => g.id);

  const [ownersRes, countsRes] = await Promise.all([
    supabase
      .from("users")
      .select("id, display_name, avatar_url")
      .in("id", ownerIds),
    supabase
      .from("recipes")
      .select("galley_id")
      .in("galley_id", galleyIds)
      .is("deleted_at", null),
  ]);

  const ownerById = new Map(
    (ownersRes.data ?? []).map((o) => [o.id, o]),
  );
  const countByGalley = new Map<string, number>();
  for (const row of countsRes.data ?? []) {
    countByGalley.set(
      row.galley_id,
      (countByGalley.get(row.galley_id) ?? 0) + 1,
    );
  }

  return galleys.map((g) => ({
    ...g,
    owner_display_name: ownerById.get(g.owner_id)?.display_name ?? null,
    owner_avatar_url: ownerById.get(g.owner_id)?.avatar_url ?? null,
    recipe_count: countByGalley.get(g.id) ?? 0,
  }));
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (q.length < 2) {
    const { data: galleys, error } = await supabase
      .from("galleys")
      .select("id, name, owner_id, public_since, header_image_path")
      .eq("is_public", true)
      .order("public_since", { ascending: false })
      .limit(MAX_RESULTS);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      galleys: await decorateGalleys(supabase, galleys ?? []),
      recipes: [],
    });
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
    galleys: await decorateGalleys(supabase, galleysRes.data ?? []),
    recipes: recipesRes.data ?? [],
  });
}
