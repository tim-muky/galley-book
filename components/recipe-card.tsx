import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { recipePhotoUrl } from "@/lib/storage";
import type { Recipe, RecipePhoto } from "@/types/database";

interface RecipeCardProps {
  recipe: Recipe & { photos?: RecipePhoto[]; recipe_photos?: RecipePhoto[] };
  className?: string;
}

export function RecipeCard({ recipe, className }: RecipeCardProps) {
  const photos = recipe.photos ?? recipe.recipe_photos ?? [];
  const primaryPhoto = photos.find((p) => p.is_primary) ?? photos[0];
  const photoUrl = primaryPhoto ? recipePhotoUrl(primaryPhoto.storage_path) : null;

  return (
    <Link href={`/recipe/${recipe.id}`} className={cn("block", className)}>
      <div className="bg-surface-lowest rounded-md overflow-hidden shadow-ambient transition-shadow hover:shadow-float">
        {/* Photo */}
        <div className="relative w-full aspect-[4/3] bg-surface-low">
          <Image
            src={photoUrl ?? "/default_recipe_pic.png"}
            alt={recipe.name}
            fill
            className="object-contain"
            sizes="(max-width: 512px) 100vw, 512px"
          />
        </div>

        {/* Info */}
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
