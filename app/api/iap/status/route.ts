import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { computeEntitlement } from "@/lib/iap/entitlement";
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

  try {
    const entitlement = await computeEntitlement(
      supabase,
      user.id,
      galleyId,
      user.created_at,
    );
    return NextResponse.json(entitlement);
  } catch (err) {
    logger.error("iap.status.query_failed", {
      userId: user.id,
      galleyId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to load subscription state" },
      { status: 500 },
    );
  }
}
