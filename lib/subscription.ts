import type { SupabaseClient } from "@supabase/supabase-js";
import { computeEntitlement } from "./iap/entitlement";

// GAL-191 + GAL-261 + GAL-262 + GAL-321 + GAL-335 — entitlement resolution.
// Delegates to computeEntitlement, which is the single source of truth used
// by /api/iap/status, /api/iap/verify-receipt, and now every paywalled
// route handler. This means trial users (3-day window post-sign-up) and
// comp entitlements are honored everywhere identically.
//
// Reads are user-session-scoped — RLS keeps results restricted to galleys
// the user is a member of, so the user-level fallback cannot leak across
// strangers.

export type Plan = "free" | "premium";

export async function getGalleyPlan(
  supabase: SupabaseClient,
  galleyId: string,
  userId: string,
  userCreatedAt?: string | null,
): Promise<Plan> {
  try {
    const entitlement = await computeEntitlement(
      supabase,
      userId,
      galleyId,
      userCreatedAt,
    );
    return entitlement.premium ? "premium" : "free";
  } catch {
    // Fail closed — treat as free if we can't determine plan, so we never
    // accidentally hand out paid features.
    return "free";
  }
}
