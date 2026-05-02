import type { SupabaseClient } from "@supabase/supabase-js";
import type { TagKind } from "@/types/database";

export const TAG_KINDS: TagKind[] = ["cuisine", "type", "season", "ingredient"];

export interface TagFilters {
  cuisine: string[];
  type: string[];
  season: string[];
  ingredient: string[];
  quick: boolean;
}

export const EMPTY_FILTERS: TagFilters = {
  cuisine: [],
  type: [],
  season: [],
  ingredient: [],
  quick: false,
};

function splitCsv(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Parse the URL search params used by the Library:
 *   - cuisine, type, season, ingredient — comma-separated values
 *   - quick=1 — prep_time <= 30 toggle
 * Backwards compat: legacy ?filter=quick / ?filter=<type> values are mapped
 * onto the new shape so old links still work.
 */
export function parseTagFilters(params: Record<string, string | undefined>): TagFilters {
  const cuisine = splitCsv(params.cuisine);
  const type = splitCsv(params.type);
  const season = splitCsv(params.season);
  const ingredient = splitCsv(params.ingredient);
  let quick = params.quick === "1" || params.quick === "true";

  if (params.filter === "quick") {
    quick = true;
  } else if (
    params.filter &&
    ["starter", "main", "dessert", "breakfast", "snack", "drink", "side"].includes(params.filter)
  ) {
    if (!type.includes(params.filter)) type.push(params.filter);
  }

  return { cuisine, type, season, ingredient, quick };
}

export function hasAnyTagFilter(f: TagFilters): boolean {
  return f.cuisine.length + f.type.length + f.season.length + f.ingredient.length > 0;
}

export function isFiltering(f: TagFilters): boolean {
  return hasAnyTagFilter(f) || f.quick;
}

/**
 * Resolve recipe IDs in this galley that satisfy the active tag filters.
 * Returns null when no tag filter is active (caller should skip the .in()).
 * Returns [] when filters are active but nothing matches — caller can short-
 * circuit. AND across kinds; OR within a kind.
 *
 * Implemented as one query per active kind followed by JS-side intersection.
 * Fine at prototype scale (≤ a few thousand tag rows per galley).
 */
export async function resolveFilteredRecipeIds(
  supabase: SupabaseClient,
  galleyId: string,
  filters: TagFilters
): Promise<string[] | null> {
  if (!hasAnyTagFilter(filters)) return null;

  let intersection: Set<string> | null = null;

  for (const kind of TAG_KINDS) {
    const values = filters[kind];
    if (values.length === 0) continue;

    const { data } = await supabase
      .from("recipe_tags")
      .select("recipe_id, recipes!inner(galley_id)")
      .eq("recipes.galley_id", galleyId)
      .eq("kind", kind)
      .in("value", values);

    const matchingIds = new Set<string>((data ?? []).map((r) => (r as { recipe_id: string }).recipe_id));

    if (intersection === null) {
      intersection = matchingIds;
    } else {
      const next = new Set<string>();
      for (const id of intersection) if (matchingIds.has(id)) next.add(id);
      intersection = next;
    }

    if (intersection.size === 0) return [];
  }

  return intersection ? [...intersection] : null;
}

/**
 * Distinct (kind, value) pairs for the galley with usage counts. Used to
 * render the filter chip rows. Returned as a per-kind map sorted by count
 * desc, then value asc.
 */
export async function loadAvailableTags(
  supabase: SupabaseClient,
  galleyId: string
): Promise<Record<TagKind, { value: string; count: number }[]>> {
  const { data } = await supabase
    .from("recipe_tags")
    .select("kind, value, recipes!inner(galley_id)")
    .eq("recipes.galley_id", galleyId);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const r = row as { kind: TagKind; value: string };
    counts[`${r.kind}::${r.value}`] = (counts[`${r.kind}::${r.value}`] ?? 0) + 1;
  }

  const out: Record<TagKind, { value: string; count: number }[]> = {
    cuisine: [],
    type: [],
    season: [],
    ingredient: [],
  };
  for (const [key, count] of Object.entries(counts)) {
    const [kind, value] = key.split("::") as [TagKind, string];
    out[kind].push({ value, count });
  }
  for (const kind of TAG_KINDS) {
    out[kind].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
  return out;
}
