"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RecipeCard } from "@/components/recipe-card";
import { AddToCookNextButton } from "@/components/add-to-cook-next-button";
import { RecipeContextMenu } from "@/components/recipe-context-menu";
import type { Recipe, RecipePhoto } from "@/types/database";

type RecipeWithPhotos = Recipe & { recipe_photos?: RecipePhoto[] };

interface Props {
  initialRecipes: RecipeWithPhotos[];
  initialHasMore: boolean;
  initialCookNextIds: string[];
  galleyId: string;
  filter: string;
  search: string;
  otherGalleys: { id: string; name: string }[];
}

export function LibraryRecipes({
  initialRecipes,
  initialHasMore,
  initialCookNextIds,
  galleyId,
  filter,
  search,
  otherGalleys,
}: Props) {
  const t = useTranslations("library");
  const [recipes, setRecipes] = useState(initialRecipes);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [cookNextIds, setCookNextIds] = useState(new Set(initialCookNextIds));
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    const cursor = recipes[recipes.length - 1]?.updated_at;
    const params = new URLSearchParams({ galleyId, limit: "20" });
    if (cursor) params.set("cursor", cursor);
    if (filter) params.set("filter", filter);
    if (search) params.set("search", search);
    try {
      const res = await fetch(`/api/recipes?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRecipes((prev) => [...prev, ...data.recipes]);
        setHasMore(data.hasMore);
        setCookNextIds((prev) => new Set([...prev, ...data.cookNextIds]));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4">
        {recipes.map((recipe) => (
          <div key={recipe.id} className="relative">
            <RecipeCard recipe={recipe} />
            <AddToCookNextButton
              recipeId={recipe.id}
              initialInList={cookNextIds.has(recipe.id)}
              className="absolute top-2 right-2 z-10"
            />
            {otherGalleys.length > 0 && (
              <RecipeContextMenu
                recipeId={recipe.id}
                otherGalleys={otherGalleys}
                className="absolute top-2 left-2 z-10"
              />
            )}
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loading}
          style={{ backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
          className="w-full mt-6 border text-sm font-light py-3 rounded-full disabled:opacity-40"
        >
          {loading ? t("loadMoreLoading") : t("loadMore")}
        </button>
      )}
    </>
  );
}
