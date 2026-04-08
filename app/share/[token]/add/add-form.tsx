"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SEASONS = ["all_year", "spring", "summer", "autumn", "winter"] as const;
const TYPES = ["starter", "main", "dessert", "breakfast", "snack", "drink", "side"] as const;
const UNITS = ["g", "kg", "ml", "l", "tsp", "tbsp", "cup", "piece", "pinch", "slice", "clove", "handful", "to taste"] as const;

interface Ingredient {
  _key: string;
  name: string;
  amount: string;
  unit: string;
}

interface Step {
  _key: string;
  instruction: string;
}

interface FormData {
  name: string;
  description: string;
  servings: string;
  prep_time: string;
  season: string;
  type: string;
  source_url: string;
  image_url: string;
  ingredients: Array<{ name: string; amount: string; unit: string }>;
  steps: Array<{ instruction: string }>;
}

export function AddFromShareForm({ initialData }: { initialData: FormData }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(initialData.name);
  const [servings, setServings] = useState(initialData.servings);
  const [prepTime, setPrepTime] = useState(initialData.prep_time);
  const [season, setSeason] = useState(initialData.season);
  const [type, setType] = useState(initialData.type);
  const [sourceUrl, setSourceUrl] = useState(initialData.source_url);
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    initialData.ingredients.map((ing) => ({ ...ing, _key: crypto.randomUUID() }))
  );
  const [steps, setSteps] = useState<Step[]>(
    initialData.steps.map((s) => ({ ...s, _key: crypto.randomUUID() }))
  );

  function updateIngredient(idx: number, field: keyof Omit<Ingredient, "_key">, value: string) {
    setIngredients((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, { _key: crypto.randomUUID(), name: "", amount: "", unit: "g" }]);
  }

  function removeIngredient(idx: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateStep(idx: number, value: string) {
    setSteps((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], instruction: value };
      return next;
    });
  }

  function addStep() {
    setSteps((prev) => [...prev, { _key: crypto.randomUUID(), instruction: "" }]);
  }

  function removeStep(idx: number) {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          servings,
          prep_time: prepTime,
          season,
          type,
          source_url: sourceUrl,
          image_url: initialData.image_url,
          ingredients,
          steps,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const { id } = await res.json();
      router.push(`/recipe/${id}`);
    } catch {
      alert("Failed to save recipe. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-5 pt-12 pb-8">
      <h1 className="text-4xl font-thin text-anthracite mb-1">Add to My Galley</h1>
      <p className="text-sm font-light text-on-surface-variant mb-6">
        Review and edit before saving to your collection.
      </p>

      <div className="bg-surface-low rounded-md px-4 py-3 mb-6">
        <p className="text-xs font-light text-on-surface-variant">
          Shared recipe below — make any changes you like before saving.
        </p>
      </div>

      <div className="space-y-6">
        {/* Name */}
        <div>
          <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">
            Recipe Name *
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-surface-highest rounded-sm px-4 py-3 text-sm font-light text-anthracite outline-none"
          />
        </div>

        {/* Servings + Prep time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">
              Servings
            </label>
            <input
              type="number"
              min="1"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              className="w-full bg-surface-highest rounded-sm px-4 py-3 text-sm font-light text-anthracite outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">
              Prep (min)
            </label>
            <input
              type="number"
              min="1"
              value={prepTime}
              onChange={(e) => setPrepTime(e.target.value)}
              placeholder="30"
              className="w-full bg-surface-highest rounded-sm px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
            />
          </div>
        </div>

        {/* Season + Type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">
              Season
            </label>
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="w-full bg-surface-highest rounded-sm px-4 py-3 text-sm font-light text-anthracite outline-none"
            >
              {SEASONS.map((s) => (
                <option key={s} value={s}>{s.replace("_", " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-surface-highest rounded-sm px-4 py-3 text-sm font-light text-anthracite outline-none"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Source URL */}
        <div>
          <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">
            Source Link
          </label>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://…"
            className="w-full bg-surface-highest rounded-sm px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
          />
        </div>

        {/* Ingredients */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-anthracite uppercase tracking-wide">
              Ingredients
            </label>
            <button
              onClick={addIngredient}
              style={{ color: "#252729", borderColor: "#252729", backgroundColor: "#fff" }}
              className="text-xs font-light border px-3 py-1 rounded-full"
            >
              + Add
            </button>
          </div>
          <div className="space-y-2">
            {ingredients.map((ing, idx) => (
              <div key={ing._key} className="flex gap-2 items-center">
                <input
                  value={ing.name}
                  onChange={(e) => updateIngredient(idx, "name", e.target.value)}
                  placeholder="Ingredient"
                  className="flex-1 bg-surface-highest rounded-sm px-3 py-2.5 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
                />
                <input
                  type="number"
                  value={ing.amount}
                  onChange={(e) => updateIngredient(idx, "amount", e.target.value)}
                  placeholder="Amt"
                  className="w-16 bg-surface-highest rounded-sm px-3 py-2.5 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
                />
                <select
                  value={ing.unit}
                  onChange={(e) => updateIngredient(idx, "unit", e.target.value)}
                  className="w-20 bg-surface-highest rounded-sm px-2 py-2.5 text-xs font-light text-anthracite outline-none"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                {ingredients.length > 1 && (
                  <button
                    onClick={() => removeIngredient(idx)}
                    className="text-on-surface-variant/50 flex-shrink-0"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M4 8h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-anthracite uppercase tracking-wide">
              Preparation Steps
            </label>
            <button
              onClick={addStep}
              style={{ color: "#252729", borderColor: "#252729", backgroundColor: "#fff" }}
              className="text-xs font-light border px-3 py-1 rounded-full"
            >
              + Add
            </button>
          </div>
          <div className="space-y-3">
            {steps.map((step, idx) => (
              <div key={step._key} className="flex gap-3 items-start">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-surface-highest flex items-center justify-center mt-2.5">
                  <span className="text-[9px] font-semibold text-anthracite">{idx + 1}</span>
                </div>
                <textarea
                  value={step.instruction}
                  onChange={(e) => updateStep(idx, e.target.value)}
                  placeholder="Describe this step…"
                  rows={2}
                  className="flex-1 bg-surface-highest rounded-sm px-3 py-2.5 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none resize-none"
                />
                {steps.length > 1 && (
                  <button
                    onClick={() => removeStep(idx)}
                    className="text-on-surface-variant/50 mt-2.5"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M4 8h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#fff" }}
          className="w-full text-sm font-light py-4 rounded-full border transition-opacity disabled:opacity-40 mt-4"
        >
          {saving ? "Saving…" : "Save to My Galley"}
        </button>
      </div>
    </div>
  );
}
