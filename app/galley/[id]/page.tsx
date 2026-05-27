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
  primaryImageUrl: string | null;
}

function recipePhotoUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-photos/${path}`;
}

async function loadGalley(id: string) {
  const service = createServiceClient();
  const { data: galley } = await service
    .from("galleys")
    .select("id, name, is_public, header_image_path")
    .eq("id", id)
    .single();
  if (!galley || !galley.is_public) return null;

  const { data: recipes } = await service
    .from("recipes")
    .select("id, name, description, prep_time, servings, created_at")
    .eq("galley_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const enriched: Recipe[] = (recipes ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: r.description as string | null,
    prep_time: r.prep_time as number | null,
    servings: r.servings as number | null,
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
  const description = `${data.recipes.length} recipes curated for galleybook. Save the whole galley to your free account in one tap.`;
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
      <header className="px-5 pt-safe-top pt-6 pb-3 flex items-center justify-between max-w-3xl mx-auto">
        <Link href="/" className="text-xs font-semibold uppercase tracking-widest text-anthracite">
          galleybook
        </Link>
        <Link
          href={SIGNUP_URL}
          className="border border-anthracite bg-anthracite text-white text-xs font-light py-2 px-4 rounded-full"
        >
          Sign up free
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-3">
          Galley of the week
        </p>
        <h1 className="text-4xl font-thin text-anthracite mb-3 leading-tight">
          {galley.name}
        </h1>
        <p className="text-sm font-light text-on-surface-variant mb-8">
          {recipes.length} recipes · curated for galleybook
        </p>

        <Link
          href={SIGNUP_URL}
          className="block border border-anthracite bg-anthracite text-white text-sm font-light py-3 rounded-full text-center mb-10"
        >
          Save this galley to galleybook
        </Link>

        <div className="grid grid-cols-2 gap-3">
          {recipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>

        <div className="mt-12 bg-surface-low rounded-md p-6 text-center">
          <p className="text-xs font-light text-anthracite mb-3">
            Want the full recipes — ingredients, steps, and your own
            shared galley?
          </p>
          <Link
            href={SIGNUP_URL}
            className="inline-block border border-anthracite bg-anthracite text-white text-sm font-light py-3 px-6 rounded-full"
          >
            Get galleybook free
          </Link>
        </div>

        <footer className="text-center mt-10 mb-6">
          <p className="text-[10px] font-light text-on-surface-variant/60">
            galleybook · for the love of cooking
          </p>
        </footer>
      </main>
    </div>
  );
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <div className="bg-white rounded-md shadow-ambient overflow-hidden">
      <div className="aspect-square relative bg-surface-low">
        {recipe.primaryImageUrl && (
          <Image
            src={recipe.primaryImageUrl}
            alt={recipe.name}
            fill
            unoptimized
            className="object-cover"
          />
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-light text-anthracite leading-snug mb-1 line-clamp-2">
          {recipe.name}
        </p>
        {recipe.description && (
          <p className="text-xs font-light text-on-surface-variant line-clamp-2">
            {recipe.description}
          </p>
        )}
        {(recipe.prep_time || recipe.servings) && (
          <p className="text-[10px] font-light text-on-surface-variant/60 mt-2">
            {recipe.prep_time && `${recipe.prep_time} min`}
            {recipe.prep_time && recipe.servings && " · "}
            {recipe.servings && `serves ${recipe.servings}`}
          </p>
        )}
      </div>
    </div>
  );
}
