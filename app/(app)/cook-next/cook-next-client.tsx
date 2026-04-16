"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

const STORAGE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-photos`;

interface CookNextEntry {
  id: string;
  recipe_id: string;
  added_at: string;
  recipes: {
    id: string;
    name: string;
    prep_time: number | null;
    servings: number | null;
    type: string | null;
    recipe_photos: Array<{ storage_path: string; is_primary: boolean | null }>;
  } | null;
}

export function CookNextClient({ initialItems }: { initialItems: CookNextEntry[] }) {
  const [items, setItems] = useState(initialItems);
  const [clearing, setClearing] = useState(false);

  async function handleRemove(entryId: string, recipeId: string) {
    // Optimistic remove
    setItems((prev) => prev.filter((i) => i.id !== entryId));
    await fetch(`/api/cook-next-list/${recipeId}`, { method: "DELETE" });
  }

  async function handleClear() {
    setClearing(true);
    await fetch("/api/cook-next-list", { method: "DELETE" });
    setItems([]);
    setClearing(false);
  }

  return (
    <div className="px-5 pt-12 pb-24">
      {/* Header */}
      <p className="text-xs font-light tracking-widest uppercase text-on-surface-variant mb-1">
        Your galley
      </p>
      <div className="flex items-end justify-between mb-6">
        <h1 className="text-4xl font-thin text-anthracite">Cook Next</h1>
        {items.length > 0 && (
          <button
            onClick={handleClear}
            disabled={clearing}
            className="text-xs font-light text-on-surface-variant transition-opacity disabled:opacity-40 active:opacity-70"
          >
            {clearing ? "Clearing…" : "Clear list"}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm font-light text-on-surface-variant mb-4">
            No recipes queued up yet.
          </p>
          <Link
            href="/library"
            style={{ backgroundColor: "#252729", color: "#fff" }}
            className="text-sm font-light px-6 py-3 rounded-full"
          >
            Browse library
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {items.map((entry) => {
            const recipe = entry.recipes;
            if (!recipe) return null;

            const primary =
              recipe.recipe_photos?.find((p) => p.is_primary) ??
              recipe.recipe_photos?.[0];
            const imgSrc = primary ? `${STORAGE_URL}/${primary.storage_path}` : null;

            return (
              <div
                key={entry.id}
                className="bg-surface-lowest rounded-md shadow-ambient overflow-hidden"
              >
                <Link href={`/recipe/${recipe.id}`}>
                  <div className="relative w-full aspect-[4/3] bg-surface-low">
                    {imgSrc ? (
                      <Image
                        src={imgSrc}
                        alt={recipe.name}
                        fill
                        className="object-cover"
                        sizes="512px"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                          <path
                            d="M4 24l7-7 4 4 5-6 8 9H4z"
                            stroke="#C6C6C6"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                          />
                          <circle cx="10" cy="10" r="3" stroke="#C6C6C6" strokeWidth="1.5" />
                        </svg>
                      </div>
                    )}
                  </div>

                  <div className="px-4 pt-3 pb-3">
                    <h3 className="text-sm font-semibold text-anthracite truncate">
                      {recipe.name}
                    </h3>
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
                        <span className="text-[10px] font-light text-on-surface-variant bg-surface-low px-2 py-1 rounded-full capitalize">
                          {recipe.type}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>

                {/* Remove button */}
                <div className="px-4 pb-4">
                  <button
                    onClick={() => handleRemove(entry.id, recipe.id)}
                    style={{ backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
                    className="w-full border text-xs font-light py-2.5 rounded-full transition-opacity active:opacity-70"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
