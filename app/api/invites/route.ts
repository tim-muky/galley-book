import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { sendGalleyInvite } from "@/lib/email";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, galleyId } = await request.json();

  if (!email?.trim() || !galleyId) {
    return NextResponse.json({ error: "Email and galleyId are required" }, { status: 400 });
  }

  // Verify inviter is a member of the galley
  const { data: membership } = await supabase
    .from("galley_members")
    .select("role")
    .eq("galley_id", galleyId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this galley" }, { status: 403 });
  }

  // Fetch inviter name + galley name in parallel
  const serviceClient = createServiceClient();
  const [{ data: inviterUser }, { data: galley }, { data: invitee }] = await Promise.all([
    serviceClient.from("users").select("name").eq("id", user.id).single(),
    serviceClient.from("galleys").select("name").eq("id", galleyId).single(),
    // Find the user to invite — service client bypasses RLS
    serviceClient.from("users").select("id").eq("email", email.trim().toLowerCase()).single(),
  ]);

  const lowerEmail = email.trim().toLowerCase();

  if (!invitee) {
    // Queue a pending invite — the trigger redeems it when they first sign in.
    const { error: pendingErr } = await supabase
      .from("pending_galley_invites")
      .upsert(
        { galley_id: galleyId, email: lowerEmail, inviter_id: user.id },
        { onConflict: "galley_id,email" }
      );
    if (pendingErr) {
      return NextResponse.json({ error: pendingErr.message }, { status: 500 });
    }

    sendGalleyInvite({
      inviterName: inviterUser?.name ?? "Someone",
      galleyName: galley?.name ?? "a galley",
      inviteUrl: "https://app.galleybook.com/auth/login",
      toEmail: lowerEmail,
    }).catch(() => {});

    return NextResponse.json({ success: true, pending: true }, { status: 201 });
  }

  // Check if already a member
  const { data: existing } = await supabase
    .from("galley_members")
    .select("id")
    .eq("galley_id", galleyId)
    .eq("user_id", invitee.id)
    .single();

  if (existing) {
    return NextResponse.json({ error: "Already a member" }, { status: 409 });
  }

  const { error } = await supabase.from("galley_members").insert({
    galley_id: galleyId,
    user_id: invitee.id,
    role: "member",
    joined_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  sendGalleyInvite({
    inviterName: inviterUser?.name ?? "Someone",
    galleyName: galley?.name ?? "a galley",
    inviteUrl: "https://app.galleybook.com/library",
    toEmail: lowerEmail,
  }).catch(() => {});

  return NextResponse.json({ success: true, pending: false }, { status: 201 });
}
