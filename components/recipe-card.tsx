import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { Recipe, RecipePhoto } from "@/types/database";

interface RecipeCardProps {
  recipe: Recipe & { photos?: RecipePhoto[]; recipe_photos?: RecipePhoto[] };
  className?: string;
}

export function RecipeCard({ recipe, className }: RecipeCardProps) {
  const photos = recipe.photos ?? recipe.recipe_photos ?? [];
  const primaryPhoto = photos.find((p) => p.is_primary) ?? photos[0];
  const photoUrl = primaryPhoto
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-photos/${primaryPhoto.storage_path}`
    : null;

  return (
    <Link href={`/recipe/${recipe.id}`} className={cn("block", className)}>
      <div className="bg-surface-lowest rounded-md overflow-hidden shadow-ambient transition-shadow hover:shadow-float">
        {/* Photo */}
        <div className="relative w-full aspect-[4/3] bg-surface-low">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={recipe.name}
              fill
              className="object-cover"
              sizes="(max-width: 512px) 100vw, 512px"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M4 24l7-7 4 4 5-6 8 9H4z" stroke="#C6C6C6" strokeWidth="1.5" strokeLinejoin="round"/>
                <circle cx="10" cy="10" r="3" stroke="#C6C6C6" strokeWidth="1.5"/>
              </svg>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="pl-0 pr-4 py-3">
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
