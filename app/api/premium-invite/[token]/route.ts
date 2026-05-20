import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// GAL-351: Public lookup of an invite by token. Used by the claim landing
// page to render inviter name + status. No auth required — token IS the auth.

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
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

  const now = Date.now();
  const expired = new Date(invite.expires_at).getTime() < now;
  if (expired && invite.status === "pending") {
    await service
      .from("premium_invites")
      .update({ status: "expired" })
      .eq("id", invite.id)
      .eq("status", "pending");
  }

  const { data: inviter } = await service
    .from("users")
    .select("display_name")
    .eq("id", invite.inviter_user_id)
    .maybeSingle();

  const inviterSubs = await service
    .from("iap_subscriptions")
    .select("status, expires_at")
    .eq("user_id", invite.inviter_user_id)
    .eq("status", "active");
  const inviterHasActiveSub = inviterSubs.data?.some(
    (s) => !s.expires_at || new Date(s.expires_at).getTime() > now,
  ) ?? false;

  return NextResponse.json({
    status: expired && invite.status === "pending" ? "expired" : invite.status,
    inviterDisplayName: inviter?.display_name ?? null,
    inviterHasActiveSub,
    alreadyClaimed: !!invite.invitee_user_id,
  });
}
