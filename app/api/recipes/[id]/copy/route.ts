import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const CopySchema = z.object({
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
  const parsed = CopySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { targetGalleyId } = parsed.data;

  // Fetch source recipe — RLS ensures caller is a member of its galley
  const { data: source } = await supabase
    .from("recipes")
    .select("*, ingredients(*), preparation_steps(*), recipe_photos(*)")
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

  const { data: copy, error: copyError } = await supabase
    .from("recipes")
    .insert({
      galley_id: targetGalleyId,
      created_by: user.id,
      name: source.name,
      description: source.description,
      servings: source.servings,
      prep_time: source.prep_time,
      season: source.season,
      type: source.type,
      source_url: source.source_url,
    })
    .select("id")
    .single();

  if (copyError || !copy) {
    return NextResponse.json({ error: "Failed to copy recipe" }, { status: 500 });
  }

  type Ingredient = { name: string; amount: number | null; unit: string | null; group_name: string | null; sort_order: number | null };
  type Step = { instruction: string; step_number: number };
  type Photo = { storage_path: string; is_primary: boolean | null; sort_order: number | null };

  const ingredients = ((source.ingredients ?? []) as Ingredient[])
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((ing, idx) => ({
      recipe_id: copy.id,
      name: ing.name,
      amount: ing.amount,
      unit: ing.unit,
      group_name: ing.group_name,
      sort_order: idx,
    }));

  const steps = ((source.preparation_steps ?? []) as Step[])
    .sort((a, b) => a.step_number - b.step_number)
    .map((s, idx) => ({
      recipe_id: copy.id,
      step_number: idx + 1,
      instruction: s.instruction,
    }));

  const photos = ((source.recipe_photos ?? []) as Photo[])
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((p, idx) => ({
      recipe_id: copy.id,
      storage_path: p.storage_path,
      is_primary: p.is_primary,
      sort_order: idx,
    }));

  await Promise.all([
    ingredients.length > 0 ? supabase.from("ingredients").insert(ingredients) : Promise.resolve(),
    steps.length > 0 ? supabase.from("preparation_steps").insert(steps) : Promise.resolve(),
    photos.length > 0 ? supabase.from("recipe_photos").insert(photos) : Promise.resolve(),
  ]);

  return NextResponse.json({ recipeId: copy.id }, { status: 201 });
}
