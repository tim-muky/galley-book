import type { SupabaseClient } from "@supabase/supabase-js";
import { computeEntitlement } from "./iap/entitlement";
import { createServiceClient } from "@/lib/supabase/service";

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

/**
 * GAL-474: metered free AI imports. OFF by default — when FREE_IMPORT_QUOTA is
 * unset or <= 0, non-premium users stay hard-walled (today's exact behavior).
 * When set to N > 0, a non-premium user gets N successful AI imports per
 * calendar month before the upgrade gate. Counted from ai_usage_logs parse
 * operations via the service client (works regardless of RLS). Note: counts all
 * parses in the month, including any made during the 3-day trial. Fails closed.
 */
export async function freeImportAllowed(userId: string): Promise<boolean> {
  const quota = Number(process.env.FREE_IMPORT_QUOTA ?? 0);
  if (!Number.isFinite(quota) || quota <= 0) return false;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const service = createServiceClient();
  const { count, error } = await service
    .from("ai_usage_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("success", true)
    .like("operation", "parse%")
    .gte("created_at", monthStart.toISOString());
  if (error) return false;
  return (count ?? 0) < quota;
}

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
