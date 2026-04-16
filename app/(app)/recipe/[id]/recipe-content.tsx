"use client";

import { useState } from "react";
import type { Ingredient, PreparationStep, RecipeTranslation } from "@/types/database";
import { BringButton } from "@/components/bring-button";
import Image from "next/image";

const STORAGE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-photos`;

const LANGUAGE_NAMES: Record<string, string> = {
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
  ru: "Russian",
  ar: "Arabic",
  tr: "Turkish",
  pl: "Polish",
};

interface Props {
  recipeId: string;
  description: string | null;
  ingredients: Ingredient[];
  steps: PreparationStep[];
  translation: RecipeTranslation | null;
  translationLanguage: string | null;
  shareToken: string;
  servings: number | null;
}

export function RecipeContent({
  recipeId,
  description,
  ingredients,
  steps,
  translation: initialTranslation,
  translationLanguage,
  shareToken,
  servings,
}: Props) {
  const [translation, setTranslation] = useState<RecipeTranslation | null>(initialTranslation);
  const [showTranslated, setShowTranslated] = useState(!!initialTranslation);
  const [translating, setTranslating] = useState(false);

  const languageName = translationLanguage ? LANGUAGE_NAMES[translationLanguage] : null;

  async function translate() {
    setTranslating(true);
    const res = await fetch(`/api/recipes/${recipeId}/translate`, { method: "POST" });
    if (res.ok) {
      const { translation: t } = await res.json();
      setTranslation(t);
      setShowTranslated(true);
    }
    setTranslating(false);
  }

  // Resolve what to display based on toggle state
  const displayDescription = showTranslated && translation?.description
    ? translation.description
    : description;

  const displayIngredients = ingredients.map((ing) => {
    if (showTranslated && translation?.ingredients) {
      const t = translation.ingredients.find((ti) => ti.id === ing.id);
      if (t) return { ...ing, name: t.name };
    }
    return ing;
  });

  const displaySteps = steps.map((step) => {
    if (showTranslated && translation?.steps) {
      const t = translation.steps.find((ts) => ts.id === step.id);
      if (t) return { ...step, instruction: t.instruction };
    }
    return step;
  });

  return (
    <>
      {/* Translation controls — only shown when a language is configured */}
      {languageName && (
        <div className="flex items-center gap-3">
          {translation ? (
            <>
              {/* Toggle pill */}
              <div className="flex items-center bg-surface-low rounded-full p-0.5">
                <button
                  onClick={() => setShowTranslated(false)}
                  className={`px-3 py-1.5 rounded-full text-xs font-light transition-colors ${
                    !showTranslated
                      ? "bg-anthracite text-white"
                      : "text-anthracite"
                  }`}
                >
                  Original
                </button>
                <button
                  onClick={() => setShowTranslated(true)}
                  className={`px-3 py-1.5 rounded-full text-xs font-light transition-colors ${
                    showTranslated
                      ? "bg-anthracite text-white"
                      : "text-anthracite"
                  }`}
                >
                  {languageName}
                </button>
              </div>
              {/* Re-translate */}
              <button
                onClick={translate}
                disabled={translating}
                className="text-xs font-light text-on-surface-variant/60 transition-opacity disabled:opacity-40"
              >
                {translating ? "Translating…" : "Re-translate"}
              </button>
            </>
          ) : (
            /* First-time translate button */
            <button
              onClick={translate}
              disabled={translating}
              className="flex items-center gap-2 px-4 py-2 bg-surface-low rounded-full text-xs font-light text-anthracite transition-opacity disabled:opacity-40"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 3h5M3 1v2M2 5c.5 1.5 1.5 2.5 3 3M9 3l2 7M7.5 7h3" stroke="#252729" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {translating ? "Translating…" : `Translate to ${languageName}`}
            </button>
          )}
        </div>
      )}

      {/* Description */}
      {displayDescription && (
        <p className="text-sm font-light text-on-surface-variant leading-relaxed">
          {displayDescription}
        </p>
      )}

      {/* Ingredients */}
      {displayIngredients.length > 0 && (
        <section>
          <h2 className="text-lg font-light text-anthracite mb-4">Ingredients</h2>
          <div className="bg-surface-low rounded-md px-5 py-2">
            {(() => {
              type IngGroup = { name: string | null; items: typeof displayIngredients };
              const groups: IngGroup[] = [];
              for (const ing of displayIngredients) {
                const gName = ing.group_name ?? null;
                const last = groups[groups.length - 1];
                if (last && last.name === gName) {
                  last.items.push(ing);
                } else {
                  groups.push({ name: gName, items: [ing] });
                }
              }
              return groups.map((group, gi) => (
                <div key={gi}>
                  {group.name && (
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant pt-3 pb-1">
                      {group.name}
                    </p>
                  )}
                  {group.items.map((ing, idx) => (
                    <div
                      key={ing.id}
                      className={`flex items-baseline justify-between py-3 ${
                        idx < group.items.length - 1 ? "border-b border-surface-highest" : ""
                      }`}
                    >
                      <span className="text-sm font-light text-anthracite">{ing.name}</span>
                      <span className="text-sm font-light text-on-surface-variant ml-4 text-right">
                        {ing.amount && `${ing.amount} `}{ing.unit}
                      </span>
                    </div>
                  ))}
                </div>
              ));
            })()}
          </div>

          <div className="mt-4">
            <BringButton shareToken={shareToken} servings={servings ?? 4} />
          </div>
        </section>
      )}

      {/* Preparation */}
      {displaySteps.length > 0 && (
        <section>
          <h2 className="text-lg font-light text-anthracite mb-4">Preparation</h2>
          <div className="space-y-6">
            {displaySteps.map((step) => (
              <div key={step.id} className="flex gap-4">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-anthracite flex items-center justify-center">
                  <span className="text-[10px] font-semibold text-white">{step.step_number}</span>
                </div>
                <div className="flex-1 pt-0.5">
                  <p className="text-sm font-light text-on-surface-variant leading-relaxed">
                    {step.instruction}
                  </p>
                  {step.photo_storage_path && (
                    <div className="mt-3 rounded-md overflow-hidden">
                      <Image
                        src={`${STORAGE_URL}/${step.photo_storage_path}`}
                        alt={`Step ${step.step_number}`}
                        width={400}
                        height={250}
                        className="w-full object-cover rounded-md"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
