import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";

// GAL-190 — Subscription state for the Settings → Subscription section.
// Reads iap_subscriptions for the requesting user's active galley membership.

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

  const { data: subs, error } = await supabase
    .from("iap_subscriptions")
    .select("user_id, product_id, source, status, expires_at, starts_at")
    .eq("galley_id", galleyId)
    .order("starts_at", { ascending: false });

  if (error) {
    logger.error("iap.status.query_failed", { userId: user.id, galleyId, message: error.message });
    return NextResponse.json({ error: "Failed to load subscription state" }, { status: 500 });
  }

  const now = Date.now();
  const activeSub = subs?.find(
    (s) => s.status === "active" && (!s.expires_at || new Date(s.expires_at).getTime() > now),
  );
  const retryingSub = subs?.find((s) => s.status === "in_billing_retry");
  const sub = activeSub ?? retryingSub ?? null;

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
