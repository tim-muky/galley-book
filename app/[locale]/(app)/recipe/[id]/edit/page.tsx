import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { EditRecipeClient } from "@/app/(app)/recipe/[id]/edit/edit-client";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: recipe } = await supabase
    .from("recipes")
    .select(`*, ingredients(*), preparation_steps(*), recipe_photos(*)`)
    .eq("id", id)
    .single();

  if (!recipe) notFound();

  const ingredients = (recipe.ingredients ?? [])
    .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
    .map((ing: { name: string; amount: number | null; unit: string | null; group_name: string | null }) => ({
      name: ing.name,
      amount: ing.amount?.toString() ?? "",
      unit: ing.unit ?? "g",
      group: ing.group_name ?? "",
    }));

  const steps = (recipe.preparation_steps ?? [])
    .sort((a: { step_number: number }, b: { step_number: number }) => a.step_number - b.step_number)
    .map((s: { instruction: string }) => ({ instruction: s.instruction }));

  const STORAGE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-photos`;
  const photos = (recipe.recipe_photos ?? []) as Array<{ storage_path: string; is_primary: boolean }>;
  const primaryPhoto = photos.find((p) => p.is_primary) ?? photos[0];
  const existingPhotoUrl = primaryPhoto
    ? `${STORAGE_URL}/${primaryPhoto.storage_path}`
    : null;

  return (
    <EditRecipeClient
      id={id}
      existingPhotoUrl={existingPhotoUrl}
      initial={{
        name: recipe.name ?? "",
        description: recipe.description ?? "",
        servings: recipe.servings?.toString() ?? "4",
        prep_time: recipe.prep_time?.toString() ?? "",
        season: recipe.season ?? "all_year",
        type: recipe.type ?? "main",
        source_url: recipe.source_url ?? "",
        ingredients: ingredients.length > 0 ? ingredients : [{ name: "", amount: "", unit: "g" }],
        steps: steps.length > 0 ? steps : [{ instruction: "" }],
      }}
    />
  );
}
