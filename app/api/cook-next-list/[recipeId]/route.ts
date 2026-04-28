import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { resolveActiveGalleyId } from "@/lib/active-galley";

// DELETE /api/cook-next-list/[recipeId] — remove one recipe from the list
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ recipeId: string }> }
) {
  const { recipeId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const galleyId = await resolveActiveGalleyId(supabase, user.id);
  if (!galleyId) return NextResponse.json({ ok: true });

  await supabase
    .from("cook_next_list")
    .delete()
    .eq("galley_id", galleyId)
    .eq("recipe_id", recipeId);

  return NextResponse.json({ ok: true });
}
