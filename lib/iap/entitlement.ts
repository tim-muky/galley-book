import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * GAL-341: shared entitlement-resolution logic used by both /api/iap/status
 * and /api/iap/verify-receipt. Centralising the merge prevents the two
 * endpoints from drifting and lets verify-receipt return the authoritative
 * entitlement in the same response — killing the read-after-write race that
 * GAL-340 had to mitigate client-side.
 *
 * Premium is resolved user-level: any active sub owned by the user makes
 * ALL their galleys premium; an active sub on the queried galley owned by
 * any member also unlocks it (galley-shared premium).
 */

export type EntitlementResult = {
  premium: boolean;
  status: "free" | "active" | "in_billing_retry" | string;
  expiresAt: string | null;
  isShared: boolean;
  source: "apple_iap" | "apple_offer_code" | "comp" | null;
};

export async function computeEntitlement(
  supabase: SupabaseClient,
  userId: string,
  galleyId: string,
): Promise<EntitlementResult> {
  const [galleyResult, userResult] = await Promise.all([
    supabase
      .from("iap_subscriptions")
      .select(
        "user_id, product_id, source, status, expires_at, starts_at, galley_id",
      )
      .eq("galley_id", galleyId)
      .order("starts_at", { ascending: false }),
    supabase
      .from("iap_subscriptions")
      .select(
        "user_id, product_id, source, status, expires_at, starts_at, galley_id",
      )
      .eq("user_id", userId)
      .order("starts_at", { ascending: false }),
  ]);

  if (galleyResult.error || userResult.error) {
    throw (galleyResult.error ?? userResult.error)!;
  }

  const seen = new Set<string>();
  const subs = [
    ...(galleyResult.data ?? []),
    ...(userResult.data ?? []),
  ].filter((row) => {
    const key = `${row.user_id}:${row.galley_id}:${row.starts_at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const now = Date.now();
  const activeSub = subs.find(
    (s) =>
      s.status === "active" &&
      (!s.expires_at || new Date(s.expires_at).getTime() > now),
  );
  const retryingSub = subs.find((s) => s.status === "in_billing_retry");
  const sub = activeSub ?? retryingSub ?? null;

  if (!sub) {
    return {
      premium: false,
      status: "free",
      expiresAt: null,
      isShared: false,
      source: null,
    };
  }

  return {
    premium: sub.status === "active",
    status: sub.status,
    expiresAt: sub.expires_at,
    isShared: sub.user_id !== userId,
    source: sub.source as EntitlementResult["source"],
  };
}
