import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GAL-332: follow / unfollow a public galley.
// Insert is gated by RLS to galleys with is_public=true (see migration).

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: galleyId } = await context.params;

  // Owners can't follow their own galley — they're already members.
  const { data: galley } = await supabase
    .from("galleys")
    .select("id, owner_id, is_public")
    .eq("id", galleyId)
    .maybeSingle();
  if (!galley) {
    return NextResponse.json({ error: "Galley not found" }, { status: 404 });
  }
  if (!galley.is_public) {
    return NextResponse.json({ error: "Galley is not public" }, { status: 403 });
  }
  if (galley.owner_id === user.id) {
    return NextResponse.json(
      { error: "Owners can't follow their own galley" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("galley_followers")
    .insert({ galley_id: galleyId, user_id: user.id });
  // Ignore unique constraint (already following).
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: galleyId } = await context.params;

  const { error } = await supabase
    .from("galley_followers")
    .delete()
    .eq("galley_id", galleyId)
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
