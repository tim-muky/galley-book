import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { resolveActiveGalleyId } from "@/lib/active-galley";

// GET /api/cook-next-list — returns all recipes in the galley's list (newest first)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const galleyId = await resolveActiveGalleyId(supabase, user.id);
  if (!galleyId) return NextResponse.json({ items: [] });

  const { data } = await supabase
    .from("cook_next_list")
    .select(`id, recipe_id, added_at, recipes(id, name, prep_time, servings, type, recipe_photos(*))`)
    .eq("galley_id", galleyId)
    .order("added_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ items: data ?? [] });
}

// POST /api/cook-next-list — add a recipe { recipeId }
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const galleyId = await resolveActiveGalleyId(supabase, user.id);
  if (!galleyId) return NextResponse.json({ error: "No galley" }, { status: 400 });

  const { recipeId } = await request.json();
  if (!recipeId) return NextResponse.json({ error: "recipeId required" }, { status: 400 });

  const { error } = await supabase
    .from("cook_next_list")
    .insert({ galley_id: galleyId, recipe_id: recipeId, added_by: user.id });

  // Ignore unique-constraint violation (already in list)
  if (error && !error.message.includes("unique")) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE /api/cook-next-list — clear all recipes from the list
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const galleyId = await resolveActiveGalleyId(supabase, user.id);
  if (!galleyId) return NextResponse.json({ ok: true });

  await supabase.from("cook_next_list").delete().eq("galley_id", galleyId);

  return NextResponse.json({ ok: true });
}
