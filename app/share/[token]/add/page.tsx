import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect, notFound } from "next/navigation";
import { AddFromShareForm } from "./add-form";

export default async function AddFromSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Auth guard — redirect to login with return URL
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/share/${token}/add`)}`);
  }

  // Fetch recipe data via service client (share token is public — no RLS)
  const supabase = createServiceClient();
  const { data: recipe } = await supabase
    .from("recipes")
    .select(`*, ingredients(*), preparation_steps(*)`)
    .eq("share_token", token)
    .single();

  if (!recipe) notFound();

  const ingredients = (recipe.ingredients ?? [])
    .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
    .map((ing: { name: string; amount: number | null; unit: string | null }) => ({
      name: ing.name,
      amount: ing.amount ? String(ing.amount) : "",
      unit: ing.unit ?? "g",
    }));

  const steps = (recipe.preparation_steps ?? [])
    .sort((a: { step_number: number }, b: { step_number: number }) => a.step_number - b.step_number)
    .map((s: { instruction: string }) => ({ instruction: s.instruction }));

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-lg mx-auto">
        <AddFromShareForm
          initialData={{
            name: recipe.name ?? "",
            description: recipe.description ?? "",
            servings: recipe.servings ? String(recipe.servings) : "4",
            prep_time: recipe.prep_time ? String(recipe.prep_time) : "",
            season: recipe.season ?? "all_year",
            type: recipe.type ?? "main",
            source_url: recipe.source_url ?? "",
            image_url: "",
            ingredients: ingredients.length > 0
              ? ingredients
              : [{ name: "", amount: "", unit: "g" }],
            steps: steps.length > 0
              ? steps
              : [{ instruction: "" }],
          }}
        />
      </div>
    </div>
  );
}
