import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isWithinPaidWindow } from "@/lib/iap/entitlement";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

// GAL-351: Create a premium-invite. Inviter must have an active sub. Partial
// unique index on (inviter_user_id) where status in ('pending','active')
// enforces one open invite at a time — surface 409 on conflict.

export const dynamic = "force-dynamic";

// GAL-361: invite landing page lives on the LANDING host (galleybook.com),
// not the app host. NEXT_PUBLIC_APP_URL points at app.galleybook.com in prod
// where next-intl rewrites /invite/* and the page 404s. The landing-host
// route is gated through the proxy.ts allowlist (see GAL-357).
const PUBLIC_HOST =
  process.env.NEXT_PUBLIC_LANDING_URL ?? "https://galleybook.com";
const TOKEN_TTL_DAYS = 7;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  // GAL-545: gate on the paid-through window (GAL-488 rule), not
  // status='active' — restores can leave a fully-paid sub at status
  // 'expired'/'cancelled' while its window is still open, and that must not
  // block invite creation. Service client: the RLS policy hides the user's
  // own rows on galleys they left (GAL-546).
  const service = createServiceClient();
  const { data: subs } = await service
    .from("iap_subscriptions")
    .select("status, expires_at")
    .eq("user_id", user.id);
  const hasActiveSub = subs?.some(isWithinPaidWindow);
  if (!hasActiveSub) {
    return NextResponse.json(
      { error: "Active premium subscription required" },
      { status: 403 },
    );
  }
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(
    now + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: row, error } = await service
    .from("premium_invites")
    .insert({
      inviter_user_id: user.id,
      invite_token: token,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id, invite_token, expires_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "You already have an open invite. Revoke it before creating a new one." },
        { status: 409 },
      );
    }
    logger.error("premium_invite.create_failed", {
      userId: user.id,
      message: error.message,
    });
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }

  const url = `${PUBLIC_HOST.replace(/\/$/, "")}/invite/${row.invite_token}`;

  logger.info("premium_invite.created", {
    inviterId: user.id,
    inviteId: row.id,
    expiresAt: row.expires_at,
  });

  return NextResponse.json({
    id: row.id,
    token: row.invite_token,
    url,
    expiresAt: row.expires_at,
  });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: invites } = await supabase
    .from("premium_invites")
    .select(
      "id, invite_token, status, expires_at, claimed_at, invitee_user_id",
    )
    .eq("inviter_user_id", user.id)
    .in("status", ["pending", "active"])
    .order("created_at", { ascending: false })
    .limit(1);

  const invite = invites?.[0] ?? null;
  if (!invite) {
    return NextResponse.json({ invite: null });
  }

  let inviteeDisplayName: string | null = null;
  if (invite.invitee_user_id) {
    const { data: invitee } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", invite.invitee_user_id)
      .maybeSingle();
    inviteeDisplayName = invitee?.display_name ?? null;
  }

  const url = `${PUBLIC_HOST.replace(/\/$/, "")}/invite/${invite.invite_token}`;
  return NextResponse.json({
    invite: {
      id: invite.id,
      status: invite.status,
      expiresAt: invite.expires_at,
      claimedAt: invite.claimed_at,
      url,
      inviteeDisplayName,
    },
  });
}
