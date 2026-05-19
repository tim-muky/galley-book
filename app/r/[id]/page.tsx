/**
 * GAL-336: public recipe page served behind a signed 48h share token.
 *
 * URL form: /r/{recipeId}?t={signedToken}
 *
 * Within the token's 48h window, anyone (no login) sees the recipe.
 * After 48h or with an invalid/missing token, we redirect to the sign-up
 * page — the visitor is not yet a user, so this is the right top-of-funnel
 * action, not a paywall.
 *
 * Signed-in galleybook users get the same public view here; they'll
 * usually open the app via Universal Links instead (see GAL-312).
 */

import { redirect } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/service";
import { recipePhotoUrl } from "@/lib/storage";
import { verifyShareToken } from "@/lib/share/token";

// GAL-336: an expired/invalid share link lives on the landing host
// (galleybook.com), where the proxy rewrites everything except /api/, /r/
// and /share/ to /landing/*. /auth/login resolves only on app.galleybook.com,
// so we send the visitor to the landing page itself — which already carries
// clear Sign-in / Sign-up CTAs and is the right top-of-funnel destination.
const SIGN_UP_PATH = "/";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { t: token } = await searchParams;
  if (!token) return { title: "galleybook" };
  const verified = verifyShareToken(token);
  if (!verified.ok || verified.recipeId !== id) return { title: "galleybook" };

  const supabase = createServiceClient();
  const { data: recipe } = await supabase
    .from("recipes")
    .select("name, description")
    .eq("id", id)
    .single();
  if (!recipe) return { title: "galleybook" };
  return {
    title: recipe.name,
    description: recipe.description ?? "Recipe from galleybook",
  };
}

export default async function SharedRecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t: token } = await searchParams;

  if (!token) redirect(SIGN_UP_PATH);

  const verified = verifyShareToken(token);
  if (!verified.ok || verified.recipeId !== id) {
    redirect(SIGN_UP_PATH);
  }

  const supabase = createServiceClient();
  const { data: recipe } = await supabase
    .from("recipes")
    .select(
      `id, name, description, prep_time, servings,
       recipe_photos(storage_path, sort_order, is_primary),
       ingredients(id, name, amount, unit, sort_order),
       preparation_steps(id, step_number, instruction)`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (!recipe) redirect(SIGN_UP_PATH);

  const photos = (recipe.recipe_photos ?? []).sort(
    (a: { sort_order: number }, b: { sort_order: number }) =>
      a.sort_order - b.sort_order,
  );
  const primaryPhoto =
    photos.find((p: { is_primary: boolean }) => p.is_primary) ?? photos[0];
  const ingredients = (recipe.ingredients ?? []).sort(
    (a: { sort_order: number | null }, b: { sort_order: number | null }) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const steps = (recipe.preparation_steps ?? []).sort(
    (a: { step_number: number }, b: { step_number: number }) =>
      a.step_number - b.step_number,
  );
  const photoUrl = primaryPhoto ? recipePhotoUrl(primaryPhoto.storage_path) : null;

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 text-anthracite">
      {photoUrl ? (
        <div className="relative w-full aspect-[4/3] mb-8 rounded-md overflow-hidden bg-surface-low">
          <Image
            src={photoUrl}
            alt={recipe.name}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
            priority
          />
        </div>
      ) : null}
      <h1 className="text-4xl font-thin mb-3">{recipe.name}</h1>
      {recipe.description ? (
        <p className="text-sm font-light text-[#474747] mb-8">
          {recipe.description}
        </p>
      ) : null}

      {ingredients.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-xs uppercase tracking-widest font-semibold mb-4">
            Ingredients
          </h2>
          <ul className="space-y-2">
            {ingredients.map(
              (ing: {
                id: string;
                name: string;
                amount: number | null;
                unit: string | null;
              }) => (
                <li
                  key={ing.id}
                  className="flex gap-3 text-sm font-light text-[#474747]"
                >
                  <span className="min-w-[80px] text-anthracite">
                    {formatAmount(ing.amount, ing.unit)}
                  </span>
                  <span>{ing.name}</span>
                </li>
              ),
            )}
          </ul>
        </section>
      ) : null}

      {steps.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-xs uppercase tracking-widest font-semibold mb-4">
            Steps
          </h2>
          <ol className="space-y-4">
            {steps.map(
              (s: { id: string; step_number: number; instruction: string }) => (
                <li key={s.id} className="text-sm font-light text-[#474747]">
                  <span className="text-anthracite font-semibold mr-2">
                    {s.step_number}.
                  </span>
                  {s.instruction}
                </li>
              ),
            )}
          </ol>
        </section>
      ) : null}

      <div className="mt-12 rounded-md bg-surface-low px-6 py-8 text-center">
        <p className="text-sm font-light mb-4">
          Save and cook this recipe with galleybook.
        </p>
        <a
          href="/auth/login"
          className="inline-block px-6 py-3 rounded-full bg-anthracite text-white text-sm font-light"
        >
          Sign up
        </a>
      </div>
    </main>
  );
}

function formatAmount(amount: number | null, unit: string | null): string {
  if (amount == null && !unit) return "";
  const num = amount != null ? formatNumber(amount) : "";
  return [num, unit].filter(Boolean).join(" ").trim();
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return Number(n.toFixed(2)).toString();
}
