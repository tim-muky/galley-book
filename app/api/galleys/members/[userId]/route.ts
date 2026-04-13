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

  if (userId === user.id) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
  }

  // Verify requester is the owner of this galley
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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
