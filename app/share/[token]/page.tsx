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
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
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

  // Check auth (best-effort — page is public so we don't fail if cookies unavailable)
  let isLoggedIn = false;
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    isLoggedIn = !!user;
  } catch {
    // No session — fine, page is public
  }

  const { data: recipe } = await supabase
    .from("recipes")
    .select(`*, recipe_photos(*), ingredients(*), preparation_steps(*)`)
    .eq("share_token", token)
    .single();

  if (!recipe) notFound();

  const { data: commentRowsRaw } = await supabase
    .from("recipe_comments")
    .select("id, body, created_at, users(name, avatar_url)")
    .eq("recipe_id", recipe.id)
    .order("created_at", { ascending: true });

  type ShareCommentRow = {
    id: string;
    body: string;
    created_at: string;
    users: { name: string | null; avatar_url: string | null } | null;
  };
  const shareComments = (commentRowsRaw ?? []) as unknown as ShareCommentRow[];

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

  // Units recognised by Bring!'s ingredient parser.
  // Unrecognised units (piece, tsp, tbsp, cup, pinch, slice, clove, handful…)
  // get fused into the item name which causes a parser error in the Bring! app.
  // For those we omit the unit from the JSON-LD string entirely.
  const BRING_UNITS = new Set([
    "g", "kg", "mg",
    "ml", "l", "dl", "cl",
    "oz", "lb", "fl oz",
    "cm", "mm",
    "pack", "packs", "package", "packages",
    "can", "cans", "jar", "jars", "bottle", "bottles",
    "bunch", "bunches",
  ]);

  // Build JSON-LD structured data — more reliable than microdata for Bring!'s parser
  const recipeIngredient = ingredients.map((ing: {
    name: string; amount: number | null; unit: string | null
  }) => {
    const unit = ing.unit && BRING_UNITS.has(ing.unit.toLowerCase().trim())
      ? ing.unit
      : null; // drop unrecognised unit so parser won't merge it into the name
    return [ing.amount ? String(ing.amount) : null, unit, ing.name]
      .filter(Boolean).join(" ");
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.name,
    author: { "@type": "Organization", name: "Galley Book" },
    description: recipe.description ?? undefined,
    // Use both old name ("ingredients") and current name ("recipeIngredient") for
    // maximum parser compatibility — Bring! documents the old Schema.org property names.
    ingredients: recipeIngredient,
    recipeIngredient,
    yield: recipe.servings ? String(recipe.servings) : undefined,
    recipeYield: recipe.servings ? String(recipe.servings) : undefined,
    prepTime: recipe.prep_time ? `PT${recipe.prep_time}M` : undefined,
    totalTime: recipe.prep_time ? `PT${recipe.prep_time}M` : undefined,
    recipeCategory: recipe.type ?? undefined,
    image: photoUrl ?? undefined,
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
      {/* Hidden metadata for parsers — use old Schema.org names that Bring! recognises */}
      <meta itemProp="author" content="Galley Book" />
      {recipe.servings && (
        <meta itemProp="yield" content={String(recipe.servings)} />
      )}
      {recipe.prep_time && (
        <meta itemProp="prepTime" content={`PT${recipe.prep_time}M`} />
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

      {/* Ingredients — itemprop="ingredients" (the name Bring!'s parser recognises) */}
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
                const ingUnit = ing.unit && BRING_UNITS.has(ing.unit.toLowerCase().trim())
                  ? ing.unit
                  : null;
                const ingText = [
                  ing.amount ? String(ing.amount) : null,
                  ingUnit,
                  ing.name,
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <li
                    key={ing.id}
                    itemProp="ingredients"
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

      {shareComments.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-light text-anthracite mb-3">Comments</h2>
          <ul className="space-y-4">
            {shareComments.map((c) => (
              <li key={c.id} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-low overflow-hidden flex-shrink-0">
                  {c.users?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.users.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-surface-highest">
                      <span className="text-[10px] font-semibold text-anthracite">
                        {c.users?.name?.[0]?.toUpperCase() ?? "?"}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-anthracite">
                      {c.users?.name ?? "—"}
                    </span>
                    <time className="text-[10px] font-light text-on-surface-variant/60">
                      {new Date(c.created_at).toLocaleDateString()}
                    </time>
                  </div>
                  <p className="text-sm font-light text-anthracite/80 mt-1 whitespace-pre-wrap break-words">
                    {c.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Add to Galley CTA */}
      <div className="mt-12 pt-6 border-t border-surface-low space-y-3">
        {isLoggedIn ? (
          <Link
            href={`/share/${token}/add`}
            className="block w-full text-center bg-[#252729] text-white text-sm font-light py-4 rounded-full border border-[#252729]"
          >
            Add to My Galley
          </Link>
        ) : (
          <>
            <Link
              href={`/share/${token}/add`}
              className="block w-full text-center bg-[#252729] text-white text-sm font-light py-4 rounded-full border border-[#252729]"
            >
              Add to My Galley
            </Link>
            <p className="text-xs font-light text-on-surface-variant text-center">
              You&apos;ll be asked to sign in first
            </p>
          </>
        )}
        <p className="text-xs font-light text-on-surface-variant text-center pt-2">
          Shared from{" "}
          <span className="font-semibold text-anthracite">Galley Book</span>
        </p>
      </div>
    </div>
    </>
  );
}
