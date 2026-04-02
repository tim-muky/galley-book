import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Verify the recipe belongs to the authenticated user's galley. */
async function assertOwnership(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  userId: string,
  recipeId: string
): Promise<boolean> {
  const { data: membership } = await supabase
    .from("galley_members")
    .select("galley_id")
    .eq("user_id", userId)
    .single();
  if (!membership) return false;

  const { data: recipe } = await supabase
    .from("recipes")
    .select("id")
    .eq("id", recipeId)
    .eq("galley_id", membership.galley_id)
    .single();

  return !!recipe;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await assertOwnership(supabase, user.id, id))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await request.json();
  const { ingredients, steps, ...recipeFields } = body;

  // Update recipe fields
  const { error } = await supabase
    .from("recipes")
    .update({
      name: recipeFields.name?.trim(),
      description: recipeFields.description?.trim() || null,
      servings: recipeFields.servings ? Number(recipeFields.servings) : null,
      prep_time: recipeFields.prep_time ? Number(recipeFields.prep_time) : null,
      season: recipeFields.season || "all_year",
      type: recipeFields.type || null,
      source_url: recipeFields.source_url?.trim() || null,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Replace ingredients
  if (ingredients !== undefined) {
    await supabase.from("ingredients").delete().eq("recipe_id", id);
    const valid = ingredients
      .filter((ing: { name?: string }) => ing.name?.trim())
      .map((ing: { name: string; amount?: string; unit?: string }, idx: number) => ({
        recipe_id: id,
        name: ing.name.trim(),
        amount: ing.amount ? Number(ing.amount) : null,
        unit: ing.unit || null,
        sort_order: idx,
      }));
    if (valid.length > 0) await supabase.from("ingredients").insert(valid);
  }

  // Replace steps
  if (steps !== undefined) {
    await supabase.from("preparation_steps").delete().eq("recipe_id", id);
    const valid = steps
      .filter((s: { instruction?: string }) => s.instruction?.trim())
      .map((s: { instruction: string }, idx: number) => ({
        recipe_id: id,
        step_number: idx + 1,
        instruction: s.instruction.trim(),
      }));
    if (valid.length > 0) await supabase.from("preparation_steps").insert(valid);
  }

  return NextResponse.json({ id });
}

// Soft delete — sets deleted_at, keeps data intact
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await assertOwnership(supabase, user.id, id))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { error } = await supabase
    .from("recipes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// Restore a soft-deleted recipe
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await assertOwnership(supabase, user.id, id))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { error } = await supabase
    .from("recipes")
    .update({ deleted_at: null })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
