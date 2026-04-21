import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await params;
  const { searchParams } = new URL(request.url);
  const galleyId = searchParams.get("galleyId");

  if (!galleyId) {
    return NextResponse.json({ error: "galleyId is required" }, { status: 400 });
  }

  const isSelf = userId === user.id;

  if (isSelf) {
    const { data: membership } = await supabase
      .from("galley_members")
      .select("role, is_default")
      .eq("galley_id", galleyId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 404 });
    }

    if (membership.role === "owner") {
      return NextResponse.json(
        { error: "Owners cannot leave — delete the galley instead" },
        { status: 400 }
      );
    }

    // Promote another membership to default before leaving
    if (membership.is_default) {
      const { data: next } = await supabase
        .from("galley_members")
        .select("galley_id")
        .eq("user_id", user.id)
        .neq("galley_id", galleyId)
        .order("invited_at", { ascending: true })
        .limit(1)
        .single();

      if (next) {
        await supabase
          .from("galley_members")
          .update({ is_default: true })
          .eq("galley_id", next.galley_id)
          .eq("user_id", user.id);
      }
    }

    const { error } = await supabase
      .from("galley_members")
      .delete()
      .eq("galley_id", galleyId)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // Owner removing another member
  const { data: galley } = await supabase
    .from("galleys")
    .select("id")
    .eq("id", galleyId)
    .eq("owner_id", user.id)
    .single();

  if (!galley) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("galley_members")
    .delete()
    .eq("galley_id", galleyId)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
