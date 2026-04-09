import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { galleyId } = await request.json();
  if (!galleyId) return NextResponse.json({ error: "galleyId is required" }, { status: 400 });

  // Verify the requester is a member of the galley
  const { data: membership } = await supabase
    .from("galley_members")
    .select("role")
    .eq("galley_id", galleyId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this galley" }, { status: 403 });
  }

  const { data: invite, error } = await supabase
    .from("galley_invites")
    .insert({ galley_id: galleyId, created_by: user.id })
    .select("token")
    .single();

  if (error || !invite) {
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }

  const { origin } = new URL(request.url);
  return NextResponse.json({ url: `${origin}/join/${invite.token}` }, { status: 201 });
}
