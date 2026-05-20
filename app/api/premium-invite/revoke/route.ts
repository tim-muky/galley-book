import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";

// GAL-351: Inviter revokes their own (pending or active) invite. Frees the
// partial-unique slot so a new invite can be created immediately.
//
// Body: { inviteId: string }

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const inviteId = body?.inviteId;
  if (!inviteId || typeof inviteId !== "string") {
    return NextResponse.json({ error: "inviteId required" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: invite } = await service
    .from("premium_invites")
    .select("id, inviter_user_id, status")
    .eq("id", inviteId)
    .maybeSingle();

  if (!invite || invite.inviter_user_id !== user.id) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.status !== "pending" && invite.status !== "active") {
    return NextResponse.json(
      { error: `Invite is already ${invite.status}` },
      { status: 409 },
    );
  }

  const { error } = await service
    .from("premium_invites")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .in("status", ["pending", "active"]);

  if (error) {
    logger.error("premium_invite.revoke_failed", {
      inviteId,
      userId: user.id,
      message: error.message,
    });
    return NextResponse.json({ error: "Failed to revoke invite" }, { status: 500 });
  }

  logger.info("premium_invite.revoked", {
    inviteId,
    inviterId: user.id,
  });

  return NextResponse.json({ ok: true });
}
