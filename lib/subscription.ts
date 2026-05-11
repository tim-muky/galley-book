import type { SupabaseClient } from "@supabase/supabase-js";

// GAL-191 + GAL-261 + GAL-262 — entitlement resolution.
// GAL-321 — Now resolves at both galley *and* user level, matching the
// /api/iap/status route. Premium is true iff EITHER
//   - the queried galley has an active iap_subscription row (galley-shared
//     premium — every member of a paid galley gets premium there), OR
//   - the requesting user owns an active iap_subscription row on any galley
//     they belong to (one paid sub follows the buyer across galleys they
//     create — Apple's one-Apple-ID-one-subscription model).
//
// Before this, AI routes (recipes/parse, recipes/parse-image, recommendations)
// used the galley-only `is_galley_premium` RPC. Restoring an Apple sub on
// galley B moved the row away from galley A → tap "Parse with AI" on galley
// A → 403 + upgrade:true → native client routes to paywall. Cue rerun.
//
// Source-agnostic: rows with source ∈ {apple_iap, apple_offer_code, comp}
// all unlock premium identically.
//
// Reads are user-session-scoped — RLS keeps results restricted to galleys
// the user is a member of, so the user-level fallback cannot leak across
// strangers.

export type Plan = "free" | "premium";

export async function getGalleyPlan(
  supabase: SupabaseClient,
  galleyId: string,
  userId: string,
): Promise<Plan> {
  const now = new Date().toISOString();

  const [galleyResult, userResult] = await Promise.all([
    supabase
      .from("iap_subscriptions")
      .select("status, expires_at")
      .eq("galley_id", galleyId)
      .eq("status", "active")
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .limit(1),
    supabase
      .from("iap_subscriptions")
      .select("status, expires_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .limit(1),
  ]);

  if (galleyResult.error && userResult.error) {
    // Fail closed — treat as free if we can't determine plan, so we never
    // accidentally hand out paid features.
    return "free";
  }

  if ((galleyResult.data?.length ?? 0) > 0) return "premium";
  if ((userResult.data?.length ?? 0) > 0) return "premium";
  return "free";
}
