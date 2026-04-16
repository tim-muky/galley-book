import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// DELETE /api/cook-next-list/[recipeId] — remove one recipe from the list
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ recipeId: string }> }
) {
  const { recipeId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("galley_members")
    .select("galley_id")
    .eq("user_id", user.id)
    .order("invited_at", { ascending: true })
    .limit(1)
    .single();

  if (!membership?.galley_id) return NextResponse.json({ ok: true });

  await supabase
    .from("cook_next_list")
    .delete()
    .eq("galley_id", membership.galley_id)
    .eq("recipe_id", recipeId);

  return NextResponse.json({ ok: true });
}
