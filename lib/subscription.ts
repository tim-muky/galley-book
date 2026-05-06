import type { SupabaseClient } from "@supabase/supabase-js";

// GAL-191 + GAL-261 + GAL-262 — Galley-level entitlement resolution.
//
// Premium is a property of the galley, not the user. A galley is premium iff
// any of its members holds an active iap_subscription row scoped to that
// galley. The DB function `is_galley_premium(uuid)` (migration 028) does the
// actual check — this wrapper exists so callers don't have to remember the
// RPC name.
//
// Source-agnostic: rows with source ∈ {apple_iap, apple_offer_code, comp}
// all unlock premium identically. When a comp expires (`expires_at <= now()`)
// or any row is revoked (`status != 'active'`), the galley falls back to free
// unless a sibling active row exists — comp grants and paid subs are
// independent and stack cleanly.

export type Plan = "free" | "premium";

export async function getGalleyPlan(
  supabase: SupabaseClient,
  galleyId: string,
): Promise<Plan> {
  const { data, error } = await supabase.rpc("is_galley_premium", {
    p_galley_id: galleyId,
  });
  if (error) {
    // Fail closed — treat as free if we can't determine plan, so we never
    // accidentally hand out paid features.
    return "free";
  }
  return data === true ? "premium" : "free";
}
