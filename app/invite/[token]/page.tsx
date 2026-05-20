import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { redirect } from "next/navigation";
import Image from "next/image";

// GAL-351: Premium-invite landing page. Invitees open this URL after the
// inviter shares their token. Auth-gated — sends through /auth/login then
// returns. Claim happens server-side on form submit.

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Auth lives on app.galleybook.com — bounce there with an absolute return
    // URL so the invitee comes back to www.galleybook.com/invite/... after sign-in.
    const next = `https://galleybook.com/invite/${token}`;
    redirect(
      `https://app.galleybook.com/auth/login?next=${encodeURIComponent(next)}`,
    );
  }

  const service = createServiceClient();
  const { data: invite } = await service
    .from("premium_invites")
    .select("id, status, expires_at, inviter_user_id, invitee_user_id")
    .eq("invite_token", token)
    .maybeSingle();

  if (!invite) {
    return <InviteError message="This invite link is invalid." />;
  }

  const now = Date.now();
  const expired =
    invite.status === "pending" &&
    new Date(invite.expires_at).getTime() < now;

  if (invite.status === "revoked") {
    return <InviteError message="This invite has been revoked." />;
  }
  if (expired) {
    return <InviteError message="This invite has expired." />;
  }
  if (invite.status === "active") {
    if (invite.invitee_user_id === user.id) {
      return (
        <InviteSuccess message="You're already using this invite — enjoy premium!" />
      );
    }
    return <InviteError message="This invite has already been claimed." />;
  }
  if (invite.inviter_user_id === user.id) {
    return <InviteError message="You can't claim your own invite." />;
  }

  const { data: inviter } = await service
    .from("users")
    .select("display_name")
    .eq("id", invite.inviter_user_id)
    .maybeSingle();
  const inviterName = inviter?.display_name ?? "A friend";

  const { data: inviterSubs } = await service
    .from("iap_subscriptions")
    .select("status, expires_at")
    .eq("user_id", invite.inviter_user_id)
    .eq("status", "active");
  const inviterActive = inviterSubs?.some(
    (s) => !s.expires_at || new Date(s.expires_at).getTime() > now,
  );
  if (!inviterActive) {
    return (
      <InviteError message="The inviter's subscription is no longer active." />
    );
  }

  const inviteId = invite.id;

  async function claim() {
    "use server";
    const actionSupabase = await createClient();
    const { data: { user: actionUser } } = await actionSupabase.auth.getUser();
    if (!actionUser) redirect("https://app.galleybook.com/auth/login");

    const actionService = createServiceClient();

    const { data: ownSubs } = await actionService
      .from("iap_subscriptions")
      .select("status, expires_at")
      .eq("user_id", actionUser.id)
      .eq("status", "active");
    const hasOwnSub = ownSubs?.some(
      (s) => !s.expires_at || new Date(s.expires_at).getTime() > Date.now(),
    );
    if (hasOwnSub) {
      redirect("https://app.galleybook.com/library?invite=already_premium");
    }

    const { error } = await actionService
      .from("premium_invites")
      .update({
        status: "active",
        invitee_user_id: actionUser.id,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", inviteId)
      .eq("status", "pending");

    if (error) {
      logger.error("premium_invite.claim_via_page_failed", {
        inviteId,
        userId: actionUser.id,
        message: error.message,
      });
      redirect("https://app.galleybook.com/library?invite=error");
    }

    logger.info("premium_invite.claimed_via_page", {
      inviteId,
      inviteeId: actionUser.id,
    });
    redirect("https://app.galleybook.com/library?invite=success");
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-8">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <Image
          src="/logo.png"
          alt="galleybook"
          width={80}
          height={80}
          className="object-contain mb-8"
          priority
        />
        <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
          You&apos;re invited
        </p>
        <h1 className="text-3xl font-thin text-anthracite mb-2">
          {inviterName} shared premium with you
        </h1>
        <p className="text-sm font-light text-on-surface-variant mb-10">
          Claim this invite to get full galleybook premium — for as long as their
          subscription stays active.
        </p>

        <form action={claim} className="w-full space-y-3">
          <button
            type="submit"
            style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
            className="w-full border text-sm font-light py-4 rounded-full"
          >
            Claim premium
          </button>
        </form>
      </div>
    </div>
  );
}

function InviteError({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-8">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <Image
          src="/logo.png"
          alt="galleybook"
          width={80}
          height={80}
          className="object-contain mb-8"
          priority
        />
        <p className="text-sm font-light text-on-surface-variant">{message}</p>
        <a
          href="https://app.galleybook.com/library"
          className="mt-6 text-sm font-light text-anthracite underline underline-offset-4"
        >
          Go to Library
        </a>
      </div>
    </div>
  );
}

function InviteSuccess({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-8">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <Image
          src="/logo.png"
          alt="galleybook"
          width={80}
          height={80}
          className="object-contain mb-8"
          priority
        />
        <p className="text-sm font-light text-on-surface-variant">{message}</p>
        <a
          href="https://app.galleybook.com/library"
          className="mt-6 text-sm font-light text-anthracite underline underline-offset-4"
        >
          Go to Library
        </a>
      </div>
    </div>
  );
}
