/**
 * GET /api/galleys/[id]/members — list members of a galley, joined with
 * public.users for name/email/avatar.
 *
 * Replaces the native two-query workaround in lib/profile.ts:listGalleyMembers
 * (GAL-233). Single round-trip, server-side join, RLS still enforced via the
 * caller's session.
 */
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: galleyId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Caller must be a member of the galley they're asking about.
  const { data: caller } = await supabase
    .from("galley_members")
    .select("id")
    .eq("galley_id", galleyId)
    .eq("user_id", user.id)
    .single();
  if (!caller) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const { data: members, error } = await supabase
    .from("galley_members")
    .select("user_id, role, joined_at, invited_at")
    .eq("galley_id", galleyId)
    .order("invited_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = Array.from(new Set((members ?? []).map((m) => m.user_id)));
  let usersById = new Map<
    string,
    { name: string | null; email: string; avatar_url: string | null }
  >();
  if (ids.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, name, email, avatar_url")
      .in("id", ids);
    for (const u of users ?? []) {
      usersById.set(u.id as string, {
        name: (u as { name: string | null }).name ?? null,
        email: (u as { email: string }).email ?? "",
        avatar_url: (u as { avatar_url: string | null }).avatar_url ?? null,
      });
    }
  }

  return NextResponse.json({
    members: (members ?? []).map((m) => {
      const u = usersById.get(m.user_id) ?? null;
      return {
        userId: m.user_id,
        galleyId,
        role: m.role,
        joinedAt: m.joined_at,
        invitedAt: m.invited_at,
        name: u?.name ?? null,
        email: u?.email ?? "",
        avatarUrl: u?.avatar_url ?? null,
      };
    }),
  });
}
