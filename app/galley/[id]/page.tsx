import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

const SIGNUP_URL = "https://app.galleybook.com/auth/login";

interface Recipe {
  id: string;
  name: string;
  description: string | null;
  prep_time: number | null;
  servings: number | null;
  type: string | null;
  primaryImageUrl: string;
}

function recipePhotoUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-photos/${path}`;
}

async function loadGalley(id: string) {
  const service = createServiceClient();
  const { data: galley } = await service
    .from("galleys")
    .select("id, name, is_public")
    .eq("id", id)
    .single();
  if (!galley || !galley.is_public) return null;

  const { data: recipes } = await service
    .from("recipes")
    .select("id, name, description, prep_time, servings, type, created_at")
    .eq("galley_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const enriched: Recipe[] = (recipes ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: r.description as string | null,
    prep_time: r.prep_time as number | null,
    servings: r.servings as number | null,
    type: r.type as string | null,
    primaryImageUrl: recipePhotoUrl(`${r.id}/primary.png`),
  }));

  return { galley, recipes: enriched };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await loadGalley(id);
  if (!data) return { title: "Galley not found" };

  const title = `${data.galley.name} · galleybook`;
  const description = `${data.recipes.length} recipes curated for galleybook. Save the whole galley to your free account.`;
  const ogImage = data.recipes[0]?.primaryImageUrl;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ogImage ? [{ url: ogImage }] : undefined,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function PublicGalleyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadGalley(id);
  if (!data) notFound();
  const { galley, recipes } = data;

  return (
    <div className="min-h-screen bg-white">
      <header className="px-5 pt-safe-top pt-6 pb-4 flex items-center justify-between max-w-2xl mx-auto">
        <Link
          href="/"
          className="text-xs font-semibold uppercase tracking-widest text-anthracite"
        >
          galleybook
        </Link>
        <Link
          href={SIGNUP_URL}
          style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
          className="border text-xs font-light py-2 px-4 rounded-full"
        >
          Sign up free
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-5 pt-2 pb-10">
        <p className="text-xs font-light tracking-widest uppercase text-on-surface-variant mb-2">
          Public galley
        </p>
        <h1 className="text-4xl font-thin text-anthracite mb-2 leading-tight">
          {galley.name}
        </h1>
        <p className="text-sm font-light text-on-surface-variant mb-6">
          {recipes.length} recipes
        </p>

        <Link
          href={SIGNUP_URL}
          style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
          className="block border text-sm font-light py-3 rounded-full text-center mb-8"
        >
          Save this galley
        </Link>

        <div className="grid grid-cols-1 gap-4">
          {recipes.map((recipe) => (
            <PublicRecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>

        <Link
          href={SIGNUP_URL}
          style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
          className="block border text-sm font-light py-3 rounded-full text-center mt-10"
        >
          Save this galley
        </Link>

        <p className="text-[10px] font-light text-on-surface-variant/60 text-center mt-10">
          galleybook · for the love of cooking
        </p>
      </main>
    </div>
  );
}

/**
 * Mirrors the in-app RecipeCard look (components/recipe-card.tsx) so the
 * public page feels native to the rest of galleybook. Click is routed to
 * the signup CTA — recipe detail is a paid surface.
 */
function PublicRecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link href={SIGNUP_URL} className="block">
      <div className="bg-surface-lowest rounded-md overflow-hidden shadow-ambient">
        <div className="relative w-full aspect-[4/3] bg-surface-low">
          <Image
            src={recipe.primaryImageUrl}
            alt={recipe.name}
            fill
            unoptimized
            className="object-contain"
            sizes="(max-width: 512px) 100vw, 512px"
          />
        </div>
        <div className="px-4 py-3">
          <h3 className="text-sm font-semibold text-anthracite truncate">{recipe.name}</h3>
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-3">
              {recipe.prep_time && (
                <span className="text-xs font-light text-on-surface-variant">
                  {recipe.prep_time} min
                </span>
              )}
              {recipe.servings && (
                <span className="text-xs font-light text-on-surface-variant">
                  {recipe.servings} servings
                </span>
              )}
            </div>
            {recipe.type && (
              <span className="flex-shrink-0 text-[10px] font-light text-on-surface-variant bg-surface-low px-2 py-1 rounded-full capitalize">
                {recipe.type}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
