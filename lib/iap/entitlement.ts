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
  source: "apple_iap" | "apple_offer_code" | "comp" | "trial" | "invite" | null;
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

  // GAL-335: if there's a real active sub it wins (longer window, real
  // entitlement). Otherwise check the 3-day trial. Free is the last resort.
  if (sub && sub.status === "active") {
    return {
      premium: true,
      status: sub.status,
      expiresAt: sub.expires_at,
      isShared: sub.user_id !== userId,
      source: sub.source as EntitlementResult["source"],
    };
  }

  // GAL-350: premium-invite from a still-subscribed inviter
  const inviterId = inviteResult.data?.inviter_user_id;
  if (inviterId) {
    const { data: inviterSubs } = await supabase
      .from("iap_subscriptions")
      .select("status, expires_at")
      .eq("user_id", inviterId)
      .eq("status", "active");
    const liveInviterSub = inviterSubs?.find(
      (s) => !s.expires_at || new Date(s.expires_at).getTime() > now,
    );
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

  if (sub) {
    // Retrying sub but past trial — still surface the status.
    return {
      premium: false,
      status: sub.status,
      expiresAt: sub.expires_at,
      isShared: sub.user_id !== userId,
      source: sub.source as EntitlementResult["source"],
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
