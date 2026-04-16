import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
import { redirect, notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { DeleteRecipeButton } from "./delete-button";
import { ShareButton } from "@/components/share-button";
import { VoteSection } from "./vote-section";
import { AddToCookNextButton } from "@/components/add-to-cook-next-button";
import { RecipeContent } from "./recipe-content";
import type { RecipeTranslation } from "@/types/database";

const STORAGE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-photos`;

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: membership } = await supabase
    .from("galley_members")
    .select("galley_id")
    .eq("user_id", user.id)
    .order("invited_at", { ascending: true })
    .limit(1)
    .single();

  const [{ data: recipe }, { data: cookNextRow }, { data: userRow }] = await Promise.all([
    supabase
      .from("recipes")
      .select(`*, recipe_photos(*), ingredients(*), preparation_steps(*), votes(*)`)
      .eq("id", id)
      .single(),
    membership?.galley_id
      ? supabase
          .from("cook_next_list")
          .select("id")
          .eq("galley_id", membership.galley_id)
          .eq("recipe_id", id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("users").select("translation_language").eq("id", user.id).single(),
  ]);

  const translationLanguage =
    (userRow as unknown as { translation_language?: string | null })?.translation_language ?? null;

  // Fetch existing translation for this recipe + language (only if language is set)
  const { data: translationRaw } = translationLanguage
    ? await supabase
        .from("recipe_translations" as never)
        .select("*")
        .eq("recipe_id", id)
        .eq("language", translationLanguage)
        .maybeSingle()
    : { data: null };

  const translation = translationRaw as RecipeTranslation | null;

  if (!recipe) notFound();

  const isInCookNext = !!cookNextRow;

  const photos = (recipe.recipe_photos ?? []).sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order);
  const primaryPhoto = photos.find((p: { is_primary: boolean }) => p.is_primary) ?? photos[0];
  const ingredients = (recipe.ingredients ?? []).sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order);
  const steps = (recipe.preparation_steps ?? []).sort((a: { step_number: number }, b: { step_number: number }) => a.step_number - b.step_number);
  const votes = recipe.votes ?? [];
  const avgVote = votes.length
    ? Math.round((votes.reduce((s: number, v: { value: number }) => s + v.value, 0) / votes.length) * 10) / 10
    : null;

  return (
    <div className="min-h-screen bg-white">
      {/* Hero image */}
      <div className="relative w-full aspect-[3/2] bg-surface-low">
        {primaryPhoto ? (
          <Image
            src={`${STORAGE_URL}/${primaryPhoto.storage_path}`}
            alt={recipe.name}
            fill
            className="object-cover"
            priority
            sizes="(max-width: 512px) 100vw, 512px"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-low">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path d="M6 36l10-10 6 6 8-9 12 13H6z" stroke="#C6C6C6" strokeWidth="2" strokeLinejoin="round"/>
              <circle cx="15" cy="15" r="4" stroke="#C6C6C6" strokeWidth="2"/>
            </svg>
          </div>
        )}

        {/* Back button */}
        <Link
          href="/library"
          aria-label="Back to library"
          className="absolute top-4 left-4 w-11 h-11 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-full shadow-ambient"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>

        {/* Cook Next button */}
        <AddToCookNextButton
          recipeId={id}
          initialInList={isInCookNext}
          className="absolute top-4 right-28"
        />

        {/* Share button */}
        {recipe.share_token && (
          <ShareButton shareToken={recipe.share_token} recipeName={recipe.name} />
        )}

        {/* Edit button */}
        <Link
          href={`/recipe/${id}/edit`}
          aria-label="Edit recipe"
          className="absolute top-4 right-4 w-11 h-11 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-full shadow-ambient"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M10.5 2.5l2 2-8 8H2.5v-2l8-8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
        </Link>

        {/* Title overlay at bottom of hero */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-5 pb-5 pt-12">
          <h1 className="text-3xl font-thin text-white leading-tight">{recipe.name}</h1>
          <div className="flex items-center gap-4 mt-1">
            {recipe.prep_time && (
              <span className="text-xs font-light text-white/80">{recipe.prep_time} min</span>
            )}
            {recipe.servings && (
              <span className="text-xs font-light text-white/80">Serves {recipe.servings}</span>
            )}
            {avgVote && (
              <span className="text-xs font-light text-white/80">★ {avgVote}</span>
            )}
          </div>
        </div>
      </div>

      {/* Extra photos strip */}
      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-5 py-3 bg-white">
          {photos.map((p: { id: string; storage_path: string; is_primary: boolean }) => (
            <div key={p.id} className="flex-shrink-0 w-16 h-16 rounded-md overflow-hidden bg-surface-low">
              <Image
                src={`${STORAGE_URL}/${p.storage_path}`}
                alt=""
                width={64}
                height={64}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="px-5 py-6 space-y-8">
        {/* Tags */}
        <div className="flex flex-wrap gap-2">
          {recipe.season && recipe.season !== "all_year" && (
            <span className="px-3 py-1 bg-surface-low rounded-full text-xs font-light text-on-surface-variant capitalize">
              {recipe.season}
            </span>
          )}
          {recipe.type && (
            <span className="px-3 py-1 bg-surface-low rounded-full text-xs font-light text-on-surface-variant capitalize">
              {recipe.type}
            </span>
          )}
          {recipe.source_url && (
            <a
              href={recipe.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 bg-surface-low rounded-full text-xs font-light text-on-surface-variant flex items-center gap-1"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M4 2H2v6h6V6M6 1h3v3M8.5 1.5L4.5 5.5" stroke="#474747" strokeWidth="1" strokeLinecap="round"/>
              </svg>
              Source
            </a>
          )}
        </div>

        <RecipeContent
          recipeId={id}
          description={recipe.description ?? null}
          ingredients={ingredients}
          steps={steps}
          translation={translation}
          translationLanguage={translationLanguage}
          shareToken={recipe.share_token}
          servings={recipe.servings ?? null}
        />

        {/* Vote */}
        <VoteSection
          recipeId={id}
          initialVote={votes.find((v: { user_id: string; value: number }) => v.user_id === user.id)?.value ?? null}
        />

        {/* Delete */}
        <div className="pt-4 pb-2">
          <DeleteRecipeButton recipeId={id} />
        </div>
      </div>
    </div>
  );
}

