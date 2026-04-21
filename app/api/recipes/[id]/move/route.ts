import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const MoveSchema = z.object({
  targetGalleyId: z.string().uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: recipeId } = await params;

  const body = await request.json();
  const parsed = MoveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { targetGalleyId } = parsed.data;

  // Fetch source recipe — RLS ensures caller is a member of its galley
  const { data: source } = await supabase
    .from("recipes")
    .select("id")
    .eq("id", recipeId)
    .is("deleted_at", null)
    .single();

  if (!source) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  // Verify caller is a member of the target galley
  const { data: targetMembership } = await supabase
    .from("galley_members")
    .select("galley_id")
    .eq("galley_id", targetGalleyId)
    .eq("user_id", user.id)
    .single();

  if (!targetMembership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("recipes")
    .update({ galley_id: targetGalleyId })
    .eq("id", recipeId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
