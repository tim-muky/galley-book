import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";

// GAL-190 — Subscription state for the Settings → Subscription section.
//
// Premium is resolved user-level: any active subscription owned by the
// requesting user makes ALL of their galleys premium, *and* a paid sub on
// the queried galley unlocks it for every member (galley-shared premium).
// The queried galleyId is still validated for membership (so status doesn't
// leak across strangers), but does not constrain which row counts as the
// "active sub". Without this, restoring an Apple subscription against a
// galley different from the one the receipt was originally verified on hit
// the transaction_id UNIQUE constraint in verify-receipt, returned
// `deduped: true`, and left the queried galley with no row — locking the
// user in a paywall loop.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const galleyId = url.searchParams.get("galleyId");
  if (!galleyId) {
    return NextResponse.json({ error: "galleyId required" }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("galley_members")
    .select("galley_id")
    .eq("galley_id", galleyId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "Not a member of that galley" }, { status: 403 });
  }

  // Two independent queries — RLS already restricts iap_subscriptions to
  // rows on galleys the user is a member of, so user-scoped lookups don't
  // leak anyone else's data. Merging in JS lets us honour both
  // "galley-shared" and "user-owned-anywhere" cases without a brittle
  // PostgREST .or() string.
  const [galleyResult, userResult] = await Promise.all([
    supabase
      .from("iap_subscriptions")
      .select("user_id, product_id, source, status, expires_at, starts_at, galley_id")
      .eq("galley_id", galleyId)
      .order("starts_at", { ascending: false }),
    supabase
      .from("iap_subscriptions")
      .select("user_id, product_id, source, status, expires_at, starts_at, galley_id")
      .eq("user_id", user.id)
      .order("starts_at", { ascending: false }),
  ]);

  if (galleyResult.error || userResult.error) {
    const error = galleyResult.error ?? userResult.error;
    logger.error("iap.status.query_failed", {
      userId: user.id,
      galleyId,
      message: error?.message,
    });
    return NextResponse.json({ error: "Failed to load subscription state" }, { status: 500 });
  }

  const seen = new Set<string>();
  const subs = [...(galleyResult.data ?? []), ...(userResult.data ?? [])].filter((row) => {
    const key = `${row.user_id}:${row.galley_id}:${row.starts_at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const now = Date.now();
  const activeSub = subs?.find(
    (s) => s.status === "active" && (!s.expires_at || new Date(s.expires_at).getTime() > now),
  );
  const retryingSub = subs?.find((s) => s.status === "in_billing_retry");
  const sub = activeSub ?? retryingSub ?? null;

  // GAL-321 — temporary debug log so we can see why a user with a known
  // active sub on one galley still gets premium=false on a sibling galley.
  // Remove once the loop report stops.
  logger.info("iap.status.debug", {
    userId: user.id,
    queriedGalleyId: galleyId,
    galleyRowCount: galleyResult.data?.length ?? 0,
    userRowCount: userResult.data?.length ?? 0,
    mergedCount: subs.length,
    statuses: subs.map((s) => `${s.status}:${s.galley_id}`),
    decision: sub ? `active:${sub.galley_id}:${sub.status}` : "none",
  });

  if (!sub) {
    return NextResponse.json({
      premium: false,
      status: "free" as const,
      expiresAt: null,
      isShared: false,
      source: null,
    });
  }

  return NextResponse.json({
    premium: sub.status === "active",
    status: sub.status,
    expiresAt: sub.expires_at,
    isShared: sub.user_id !== user.id,
    source: sub.source,
  });
}
