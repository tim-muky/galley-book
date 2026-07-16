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
  source: "apple_iap" | "apple_offer_code" | "google_iap" | "comp" | "trial" | "invite" | null;
};

// GAL-335: every user gets 3 days of full premium starting at sign-up so
// the first cooking sessions feel unfettered. After the window expires the
// regular subscription gate takes over.
const TRIAL_LENGTH_MS = 3 * 24 * 60 * 60 * 1000;

function trialEntitlement(userCreatedAt: string | null | undefined): EntitlementResult | null {
  if (!userCreatedAt) return null;
  const start = new Date(userCreatedAt).getTime();
  if (!Number.isFinite(start)) return null;
  const end = start + TRIAL_LENGTH_MS;
  if (Date.now() >= end) return null;
  return {
    premium: true,
    status: "active",
    expiresAt: new Date(end).toISOString(),
    isShared: false,
    source: "trial",
  };
}

export async function computeEntitlement(
  supabase: SupabaseClient,
  userId: string,
  galleyId: string,
  userCreatedAt?: string | null,
): Promise<EntitlementResult> {
  // GAL-350: third source of premium — an active premium_invites row whose
  // inviter still has an active sub. Resolved at read time so cascade
  // revocation is automatic when the inviter cancels/lapses/deletes.
  const [galleyResult, userResult, inviteResult] = await Promise.all([
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
    supabase
      .from("premium_invites")
      .select("id, inviter_user_id")
      .eq("invitee_user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (galleyResult.error || userResult.error) {
    throw (galleyResult.error ?? userResult.error)!;
  }

  const seen = new Set<string>();
  const subs = [
    ...(galleyResult.data ?? []),
    ...(userResult.data ?? []),
  ]
    .filter((row) => {
      const key = `${row.user_id}:${row.galley_id}:${row.starts_at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
    );

  const now = Date.now();

  // GAL-488: entitlement is decided by the paid-through window, NOT by the
  // `status` column being exactly 'active'. A subscription grants premium for
  // as long as its current paid period is still open and it wasn't revoked or
  // refunded. Turning off auto-renew (Apple leaves the row 'active' but a
  // stale/out-of-order notification could mark it 'expired'; Play marks it
  // 'cancelled'), or an in-flight billing retry during the grace window, must
  // NOT revoke access before expires_at actually passes. `status` is advisory;
  // expires_at is the source of truth. Before this, any sub whose status drifted
  // off 'active' (very common — every cancel-but-keep-the-month) was denied
  // premium and bounced back to the paywall despite being fully paid up.
  const isWithinPaidWindow = (s: {
    status: string;
    expires_at: string | null;
  }): boolean => {
    if (s.status === "revoked") return false; // refund / chargeback → no access
    return s.expires_at
      ? new Date(s.expires_at).getTime() > now
      : s.status === "active"; // null expiry = comp / forever grant
  };

  const entitledSub = subs.find(isWithinPaidWindow) ?? null;
  if (entitledSub) {
    return {
      premium: true,
      status: entitledSub.status,
      expiresAt: entitledSub.expires_at,
      isShared: entitledSub.user_id !== userId,
      source: entitledSub.source as EntitlementResult["source"],
    };
  }

  // GAL-350: premium-invite from a still-subscribed inviter
  const inviterId = inviteResult.data?.inviter_user_id;
  if (inviterId) {
    const { data: inviterSubs } = await supabase
      .from("iap_subscriptions")
      .select("status, expires_at")
      .eq("user_id", inviterId);
    const liveInviterSub = inviterSubs?.find(isWithinPaidWindow);
    if (liveInviterSub) {
      return {
        premium: true,
        status: "active",
        expiresAt: liveInviterSub.expires_at,
        isShared: true,
        source: "invite",
      };
    }
  }

  const trial = trialEntitlement(userCreatedAt);
  if (trial) return trial;

  // Not premium — surface the most recent sub's status (if any) so the UI can
  // distinguish "expired subscriber" from "never subscribed".
  const latestSub = subs[0] ?? null;
  if (latestSub) {
    return {
      premium: false,
      status: latestSub.status,
      expiresAt: latestSub.expires_at,
      isShared: latestSub.user_id !== userId,
      source: latestSub.source as EntitlementResult["source"],
    };
  }

  return {
    premium: false,
    status: "free",
    expiresAt: null,
    isShared: false,
    source: null,
  };
}
