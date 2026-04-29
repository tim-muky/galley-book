import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Native deep-link redemption: takes an invite token and adds the authed
// user to the galley. Mirrors the server action on /join/[token]/page.tsx.
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await request.json();
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  const service = createServiceClient();
  const { data: invite } = await service
    .from("galley_invites")
    .select("galley_id, galleys(name)")
    .eq("token", token)
    .single();

  if (!invite) {
    return NextResponse.json({ error: "Invite invalid or expired" }, { status: 404 });
  }

  const galleyRow = invite.galleys as unknown as { name: string } | null;
  const galleyName = galleyRow?.name ?? null;

  const { data: existing } = await supabase
    .from("galley_members")
    .select("id")
    .eq("galley_id", invite.galley_id)
    .eq("user_id", user.id)
    .single();

  if (existing) {
    return NextResponse.json(
      { alreadyMember: true, galleyId: invite.galley_id, galleyName },
      { status: 200 }
    );
  }

  const { error } = await supabase.from("galley_members").insert({
    galley_id: invite.galley_id,
    user_id: user.id,
    role: "member",
    joined_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ galleyId: invite.galley_id, galleyName }, { status: 201 });
}
