/**
 * Public recipe share page — no auth required.
 *
 * This page serves Schema.org Recipe microdata so Bring!'s servers can
 * parse it when generating a shopping list deeplink. The URL format is:
 *   https://galleybook.com/share/<share_token>
 *
 * The share_token is a UUID stored on each recipe row and is NOT the
 * recipe's private UUID, so the recipe's identity in the app stays hidden.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";

const STORAGE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-photos`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const supabase = createServiceClient();
  const { data: recipe } = await supabase
    .from("recipes")
    .select("name, description")
    .eq("share_token", token)
    .single();

  if (!recipe) return { title: "Recipe" };

  return {
    title: recipe.name,
    description: recipe.description ?? `Recipe from Galley Book`,
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: recipe } = await supabase
    .from("recipes")
    .select(`*, recipe_photos(*), ingredients(*), preparation_steps(*)`)
    .eq("share_token", token)
    .single();

  if (!recipe) notFound();

  const photos = (recipe.recipe_photos ?? []).sort(
    (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
  );
  const primaryPhoto = photos.find((p: { is_primary: boolean }) => p.is_primary) ?? photos[0];
  const ingredients = (recipe.ingredients ?? []).sort(
    (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
  );
  const steps = (recipe.preparation_steps ?? []).sort(
    (a: { step_number: number }, b: { step_number: number }) => a.step_number - b.step_number
  );

  const photoUrl = primaryPhoto
    ? `${STORAGE_URL}/${primaryPhoto.storage_path}`
    : null;

  // Build JSON-LD structured data — more reliable than microdata for Bring!'s parser
  const recipeIngredient = ingredients.map((ing: {
    name: string; amount: number | null; unit: string | null
  }) =>
    [ing.amount ? String(ing.amount) : null, ing.unit, ing.name]
      .filter(Boolean).join(" ")
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.name,
    description: recipe.description ?? undefined,
    recipeYield: recipe.servings ? String(recipe.servings) : undefined,
    totalTime: recipe.prep_time ? `PT${recipe.prep_time}M` : undefined,
    recipeCategory: recipe.type ?? undefined,
    image: photoUrl ?? undefined,
    recipeIngredient,
  };

  return (
    <>
      {/* JSON-LD in <head> — primary method for Bring! to parse ingredients */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

    <div
      itemScope
      itemType="http://schema.org/Recipe"
      className="max-w-lg mx-auto px-5 py-8 bg-white min-h-screen"
    >
      {/* Hidden metadata for parsers */}
      <meta itemProp="author" content="Galley Book" />
      {recipe.servings && (
        <meta itemProp="recipeYield" content={String(recipe.servings)} />
      )}
      {recipe.prep_time && (
        <meta itemProp="totalTime" content={`PT${recipe.prep_time}M`} />
      )}
      {recipe.type && <meta itemProp="recipeCategory" content={recipe.type} />}

      {/* Hero image */}
      {photoUrl && (
        <div className="relative w-full aspect-[4/3] rounded-md overflow-hidden mb-6">
          <Image
            src={photoUrl}
            alt={recipe.name}
            fill
            className="object-cover"
            priority
            sizes="(max-width: 512px) 100vw, 512px"
            itemProp="image"
          />
        </div>
      )}

      {/* Title */}
      <h1
        itemProp="name"
        className="text-3xl font-thin text-anthracite leading-tight mb-2"
      >
        {recipe.name}
      </h1>

      <div className="flex gap-4 mb-6">
        {recipe.prep_time && (
          <span className="text-xs font-light text-on-surface-variant">
            {recipe.prep_time} min
          </span>
        )}
        {recipe.servings && (
          <span className="text-xs font-light text-on-surface-variant">
            Serves {recipe.servings}
          </span>
        )}
      </div>

      {/* Ingredients — itemprop="recipeIngredient" for Schema.org */}
      {ingredients.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-light text-anthracite mb-3">Ingredients</h2>
          <ul className="space-y-2">
            {ingredients.map(
              (ing: {
                id: string;
                name: string;
                amount: number | null;
                unit: string | null;
              }) => {
                const ingText = [
                  ing.amount ? String(ing.amount) : null,
                  ing.unit,
                  ing.name,
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <li
                    key={ing.id}
                    itemProp="recipeIngredient"
                    className="text-sm font-light text-on-surface-variant"
                  >
                    {ingText}
                  </li>
                );
              }
            )}
          </ul>
        </section>
      )}

      {/* Steps — itemprop="recipeInstructions" */}
      {steps.length > 0 && (
        <section>
          <h2 className="text-lg font-light text-anthracite mb-3">Preparation</h2>
          <ol className="space-y-4">
            {steps.map(
              (step: {
                id: string;
                step_number: number;
                instruction: string;
              }) => (
                <li
                  key={step.id}
                  itemProp="recipeInstructions"
                  className="flex gap-3"
                >
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-surface-highest flex items-center justify-center text-[9px] font-semibold text-anthracite">
                    {step.step_number}
                  </span>
                  <p className="text-sm font-light text-on-surface-variant leading-relaxed">
                    {step.instruction}
                  </p>
                </li>
              )
            )}
          </ol>
        </section>
      )}

      {/* Branding */}
      <div className="mt-12 pt-6 border-t border-surface-low text-center">
        <p className="text-xs font-light text-on-surface-variant">
          Shared from{" "}
          <span className="font-semibold text-anthracite">Galley Book</span>
        </p>
      </div>
    </div>
    </>
  );
}
