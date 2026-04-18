import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

const SEED_SHARE_TOKENS = [
  "22510772-776a-4b34-b170-851cf01d75b1",
  "86da3834-dae2-40da-8687-16ab9569f6a0",
  "227f7d8f-f377-4fa8-bc52-30898422e6d5",
];

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Support both JSON and form data
  const contentType = request.headers.get("content-type") ?? "";
  let name: string;

  if (contentType.includes("application/json")) {
    const body = await request.json();
    name = body.name;
  } else {
    const form = await request.formData();
    name = form.get("name") as string;
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .rpc("create_galley", { galley_name: name.trim(), owner: user.id });

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create galley" }, { status: 500 });
  }

  const galleyId = data as string;

  // Seed default recipes for new users
  await seedDefaultRecipes(supabase, galleyId, user.id);

  if (!contentType.includes("application/json")) {
    return new Response(null, { status: 303, headers: { Location: "/library" } });
  }

  return NextResponse.json({ id: galleyId }, { status: 201 });
}

async function seedDefaultRecipes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  galleyId: string,
  userId: string
) {
  const service = createServiceClient();
  const { data: seeds } = await service
    .from("recipes")
    .select("*, ingredients(*), preparation_steps(*), recipe_photos(*)")
    .in("share_token", SEED_SHARE_TOKENS)
    .is("deleted_at", null);

  if (!seeds || seeds.length === 0) return;

  for (const seed of seeds) {
    const { data: recipe } = await supabase
      .from("recipes")
      .insert({
        galley_id: galleyId,
        created_by: userId,
        name: seed.name,
        description: seed.description,
        servings: seed.servings,
        prep_time: seed.prep_time,
        season: seed.season,
        type: seed.type,
        source_url: seed.source_url,
      })
      .select("id")
      .single();

    if (!recipe) continue;

    const ingredients = (seed.ingredients ?? [])
      .sort((a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((ing: { name: string; amount: number | null; unit: string | null; group_name: string | null }, idx: number) => ({
        recipe_id: recipe.id,
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit,
        group_name: ing.group_name,
        sort_order: idx,
      }));

    if (ingredients.length > 0) {
      await supabase.from("ingredients").insert(ingredients);
    }

    const steps = (seed.preparation_steps ?? [])
      .sort((a: { step_number: number }, b: { step_number: number }) => a.step_number - b.step_number)
      .map((s: { instruction: string }, idx: number) => ({
        recipe_id: recipe.id,
        step_number: idx + 1,
        instruction: s.instruction,
      }));

    if (steps.length > 0) {
      await supabase.from("preparation_steps").insert(steps);
    }

    const photos = (seed.recipe_photos ?? [])
      .sort((a: { sort_order: number | null }, b: { sort_order: number | null }) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((p: { storage_path: string; is_primary: boolean | null }, idx: number) => ({
        recipe_id: recipe.id,
        storage_path: p.storage_path,
        is_primary: p.is_primary,
        sort_order: idx,
      }));

    if (photos.length > 0) {
      await supabase.from("recipe_photos").insert(photos);
    }
  }
}
