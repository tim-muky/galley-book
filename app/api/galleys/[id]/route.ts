import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: galleyId } = await params;
  const { name } = await request.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("galley_members")
    .select("role")
    .eq("galley_id", galleyId)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("galleys")
    .update({ name: name.trim() })
    .eq("id", galleyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: galleyId } = await params;

  const { data: membership } = await supabase
    .from("galley_members")
    .select("role, is_default")
    .eq("galley_id", galleyId)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // If this was the default, promote next-oldest membership before the galley cascades away.
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

  const { error } = await supabase.from("galleys").delete().eq("id", galleyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
