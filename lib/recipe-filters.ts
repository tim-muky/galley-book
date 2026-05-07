import type { SupabaseClient } from "@supabase/supabase-js";
import type { TagKind } from "@/types/database";

export const TAG_KINDS: TagKind[] = ["cuisine", "type", "season", "ingredient"];

export interface TagFilters {
  cuisine: string[];
  type: string[];
  season: string[];
  ingredient: string[];
}

export const EMPTY_FILTERS: TagFilters = {
  cuisine: [],
  type: [],
  season: [],
  ingredient: [],
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
 * Backwards compat: legacy ?filter=<type> values are mapped onto type array.
 */
export function parseTagFilters(params: Record<string, string | undefined>): TagFilters {
  const cuisine = splitCsv(params.cuisine);
  const type = splitCsv(params.type);
  const season = splitCsv(params.season);
  const ingredient = splitCsv(params.ingredient);

  if (
    params.filter &&
    ["starter", "main", "dessert", "breakfast", "snack", "drink", "side"].includes(params.filter)
  ) {
    if (!type.includes(params.filter)) type.push(params.filter);
  }

  return { cuisine, type, season, ingredient };
}

export function hasAnyTagFilter(f: TagFilters): boolean {
  return f.cuisine.length + f.type.length + f.season.length + f.ingredient.length > 0;
}

export function isFiltering(f: TagFilters): boolean {
  return hasAnyTagFilter(f);
}

/**
 * Resolve recipe IDs in this galley that satisfy the active tag filters.
 * Returns null when no tag filter is active (caller should skip the .in()).
 * Returns [] when filters are active but nothing matches — caller can short-
 * circuit. AND across kinds; OR within a kind.
 *
 * One Postgres call via recipes_matching_tag_filters RPC (GAL-303).
 */
export async function resolveFilteredRecipeIds(
  supabase: SupabaseClient,
  galleyId: string,
  filters: TagFilters
): Promise<string[] | null> {
  if (!hasAnyTagFilter(filters)) return null;

  const { data, error } = await supabase.rpc("recipes_matching_tag_filters", {
    p_galley_id: galleyId,
    p_filters: filters,
  });
  if (error) throw error;
  return ((data ?? []) as Array<{ recipe_id: string }>).map((r) => r.recipe_id);
}

/**
 * Distinct (kind, value) pairs for the galley with usage counts. Used to
 * render the filter chip rows. Returned as a per-kind map sorted by count
 * desc, then value asc (sorted server-side; iteration preserves order).
 *
 * One Postgres aggregation via available_recipe_tags RPC (GAL-304).
 */
export async function loadAvailableTags(
  supabase: SupabaseClient,
  galleyId: string
): Promise<Record<TagKind, { value: string; count: number }[]>> {
  const { data, error } = await supabase.rpc("available_recipe_tags", {
    p_galley_id: galleyId,
  });
  if (error) throw error;

  const out: Record<TagKind, { value: string; count: number }[]> = {
    cuisine: [],
    type: [],
    season: [],
    ingredient: [],
  };
  for (const row of (data ?? []) as Array<{ kind: TagKind; value: string; count: number }>) {
    out[row.kind].push({ value: row.value, count: Number(row.count) });
  }
  return out;
}
