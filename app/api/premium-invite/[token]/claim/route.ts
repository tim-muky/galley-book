import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";

// GAL-351: Claim an invite as the authenticated invitee. Rejects if the user
// already has premium (own sub or active invitee elsewhere), if the invite is
// expired/revoked, or if the inviter no longer has an active sub.

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await context.params;
  const service = createServiceClient();

  const { data: invite } = await service
    .from("premium_invites")
    .select("id, status, expires_at, inviter_user_id, invitee_user_id")
    .eq("invite_token", token)
    .maybeSingle();

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.inviter_user_id === user.id) {
    return NextResponse.json(
      { error: "You can't claim your own invite" },
      { status: 400 },
    );
  }
  if (invite.status !== "pending") {
    return NextResponse.json(
      { error: `Invite is ${invite.status}` },
      { status: 409 },
    );
  }
  const now = Date.now();
  if (new Date(invite.expires_at).getTime() < now) {
    await service
      .from("premium_invites")
      .update({ status: "expired" })
      .eq("id", invite.id)
      .eq("status", "pending");
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }

  // Reject if the invitee already has premium (own sub or another active invite)
  const { data: ownSubs } = await service
    .from("iap_subscriptions")
    .select("status, expires_at")
    .eq("user_id", user.id)
    .eq("status", "active");
  const hasOwnSub = ownSubs?.some(
    (s) => !s.expires_at || new Date(s.expires_at).getTime() > now,
  );
  if (hasOwnSub) {
    return NextResponse.json(
      { error: "You already have an active subscription" },
      { status: 409 },
    );
  }
  const { data: existingInvite } = await service
    .from("premium_invites")
    .select("id")
    .eq("invitee_user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (existingInvite) {
    return NextResponse.json(
      { error: "You already have an active invite" },
      { status: 409 },
    );
  }

  // Inviter must still be subscribed
  const { data: inviterSubs } = await service
    .from("iap_subscriptions")
    .select("status, expires_at")
    .eq("user_id", invite.inviter_user_id)
    .eq("status", "active");
  const inviterActive = inviterSubs?.some(
    (s) => !s.expires_at || new Date(s.expires_at).getTime() > now,
  );
  if (!inviterActive) {
    return NextResponse.json(
      { error: "The inviter's subscription is no longer active" },
      { status: 409 },
    );
  }

  const { error: updateError } = await service
    .from("premium_invites")
    .update({
      status: "active",
      invitee_user_id: user.id,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", invite.id)
    .eq("status", "pending");

  if (updateError) {
    logger.error("premium_invite.claim_failed", {
      inviteId: invite.id,
      inviteeId: user.id,
      message: updateError.message,
    });
    return NextResponse.json({ error: "Failed to claim invite" }, { status: 500 });
  }

  logger.info("premium_invite.claimed", {
    inviteId: invite.id,
    inviterId: invite.inviter_user_id,
    inviteeId: user.id,
  });

  return NextResponse.json({ ok: true });
}
