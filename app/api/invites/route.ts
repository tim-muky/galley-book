import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

  // Find the user to invite
  const { data: invitee } = await supabase
    .from("users")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .single();

  if (!invitee) {
    return NextResponse.json({ error: "User not found. They need to sign up first." }, { status: 404 });
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

  return NextResponse.json({ success: true }, { status: 201 });
}
