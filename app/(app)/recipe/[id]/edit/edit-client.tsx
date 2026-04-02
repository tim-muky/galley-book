"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

const SEASONS = ["all_year", "spring", "summer", "autumn", "winter"] as const;
const TYPES = ["starter", "main", "dessert", "breakfast", "snack", "drink", "side"] as const;
const UNITS = ["g", "kg", "ml", "l", "tsp", "tbsp", "cup", "piece", "pinch", "slice", "clove", "handful", "to taste"] as const;

interface Ingredient {
  _key: string; // stable React list key — not sent to the API
  name: string;
  amount: string;
  unit: string;
}

interface Step {
  _key: string; // stable React list key — not sent to the API
  instruction: string;
}

interface RecipeForm {
  name: string;
  description: string;
  servings: string;
  prep_time: string;
  season: string;
  type: string;
  source_url: string;
  ingredients: Ingredient[];
  steps: Step[];
}

interface Props {
  id: string;
  existingPhotoUrl: string | null;
  initial: RecipeForm;
}

export function EditRecipeClient({ id, existingPhotoUrl, initial }: Props) {
  // Lazy initialiser: add stable _key to each item so React keys never collide
  // when items are removed from the middle of the list.
  const [form, setForm] = useState<RecipeForm>(() => ({
    ...initial,
    ingredients: initial.ingredients.map((ing) => ({ ...ing, _key: crypto.randomUUID() })),
    steps: initial.steps.map((step) => ({ ...step, _key: crypto.randomUUID() })),
  }));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string>(existingPhotoUrl ?? "");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function updateField<K extends keyof RecipeForm>(key: K, value: RecipeForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateIngredient(idx: number, field: keyof Ingredient, value: string) {
    setForm((prev) => {
      const ingredients = [...prev.ingredients];
      ingredients[idx] = { ...ingredients[idx], [field]: value };
      return { ...prev, ingredients };
    });
  }

  function addIngredient() {
    setForm((prev) => ({
      ...prev,
      ingredients: [...prev.ingredients, { _key: crypto.randomUUID(), name: "", amount: "", unit: "g" }],
    }));
  }

  function removeIngredient(idx: number) {
    setForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== idx),
    }));
  }

  function updateStep(idx: number, value: string) {
    setForm((prev) => {
      const steps = [...prev.steps];
      steps[idx] = { ...steps[idx], instruction: value };
      return { ...prev, steps };
    });
  }

  function addStep() {
    setForm((prev) => ({
      ...prev,
      steps: [...prev.steps, { _key: crypto.randomUUID(), instruction: "" }],
    }));
  }

  function removeStep(idx: number) {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== idx),
    }));
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    // Show preview immediately
    const preview = URL.createObjectURL(file);
    setPhotoPreview(preview);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`/api/recipes/${id}/photos`, { method: "POST", body: fd });
      if (!res.ok) {
        setPhotoPreview(existingPhotoUrl ?? "");
        alert("Photo upload failed. Please try again.");
      }
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/recipes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to save");
      router.push(`/recipe/${id}`);
    } catch {
      alert("Could not save recipe. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this recipe? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/recipes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      router.push("/library");
    } catch {
      alert("Could not delete recipe. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="px-5 pt-12 pb-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/recipe/${id}`}
          className="text-xs font-light text-on-surface-variant mb-1 flex items-center gap-1"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M7.5 9L4.5 6l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </Link>
        <h1 className="text-4xl font-thin text-anthracite">Edit Recipe</h1>
      </div>

      <div className="space-y-6">
        {/* Photo */}
        <div>
          <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">
            Photo
          </label>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelect}
          />
          {photoPreview ? (
            <div className="relative w-full aspect-[3/2] rounded-md overflow-hidden bg-surface-low">
              <Image
                src={photoPreview}
                alt="Recipe photo"
                fill
                className="object-cover"
                unoptimized={photoPreview.startsWith("blob:")}
              />
              {uploadingPhoto && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <span className="text-xs text-white font-light">Uploading…</span>
                </div>
              )}
              {!uploadingPhoto && (
                <div className="absolute bottom-3 left-3">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="text-xs font-light text-white bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-sm"
                  >
                    Change Photo
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="w-full aspect-[3/2] rounded-md border border-anthracite/20 flex flex-col items-center justify-center gap-2 bg-surface-low"
            >
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M4 20l6-6 4 4 4-5 6 7H4z" stroke="#C6C6C6" strokeWidth="1.5" strokeLinejoin="round"/>
                <circle cx="9" cy="10" r="2.5" stroke="#C6C6C6" strokeWidth="1.5"/>
                <rect x="2" y="5" width="24" height="18" rx="2" stroke="#C6C6C6" strokeWidth="1.5"/>
              </svg>
              <span className="text-xs font-light text-on-surface-variant">Add Photo</span>
            </button>
          )}
        </div>

        {/* Name */}
        <div>
          <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">
            Recipe Name *
          </label>
          <input
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="e.g. Heirloom Tomato & Burrata Salad"
            className="w-full bg-surface-highest rounded-sm px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">
            Description
          </label>
          <textarea
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="A short description…"
            rows={2}
            className="w-full bg-surface-highest rounded-sm px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none resize-none"
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
              value={form.servings}
              onChange={(e) => updateField("servings", e.target.value)}
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
              value={form.prep_time}
              onChange={(e) => updateField("prep_time", e.target.value)}
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
              value={form.season}
              onChange={(e) => updateField("season", e.target.value)}
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
              value={form.type}
              onChange={(e) => updateField("type", e.target.value)}
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
            value={form.source_url}
            onChange={(e) => updateField("source_url", e.target.value)}
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
              className="text-xs font-light text-anthracite border border-anthracite/30 px-3 py-1 rounded-full"
            >
              + Add
            </button>
          </div>
          <div className="space-y-2">
            {form.ingredients.map((ing, idx) => (
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
                {form.ingredients.length > 1 && (
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
              className="text-xs font-light text-anthracite border border-anthracite/30 px-3 py-1 rounded-full"
            >
              + Add
            </button>
          </div>
          <div className="space-y-3">
            {form.steps.map((step, idx) => (
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
                {form.steps.length > 1 && (
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
          disabled={saving || !form.name.trim()}
          className="w-full bg-anthracite text-white text-sm font-light py-4 rounded-full border border-anthracite transition-opacity disabled:opacity-40 mt-4"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="w-full text-red-500 text-sm font-light py-3 rounded-full border border-red-200 transition-opacity disabled:opacity-40"
        >
          {deleting ? "Deleting…" : "Delete Recipe"}
        </button>
      </div>
    </div>
  );
}
