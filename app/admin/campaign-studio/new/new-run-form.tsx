"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewRunForm() {
  const router = useRouter();
  const [country, setCountry] = useState("");
  const [style, setStyle] = useState("");
  const [dishType, setDishType] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [notes, setNotes] = useState("");
  const [locale, setLocale] = useState<"en" | "de">("de");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/admin/campaign-studio/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        country: country.trim() || undefined,
        style: style.trim() || undefined,
        dishType: dishType.trim() || undefined,
        ingredientSeeds: ingredients
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        notes: notes.trim() || undefined,
        locale,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to start run");
      setSubmitting(false);
      return;
    }

    const { runId } = await res.json();
    router.push(`/admin/campaign-studio/runs/${runId}/curate-candidates`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field label="Country / cuisine" hint="e.g. Italy, Germany, Mexico, global">
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Italy"
          className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
        />
      </Field>

      <Field label="Style" hint="e.g. comfort food, weeknight, seasonal summer, vegan">
        <input
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          placeholder="weeknight comfort"
          className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
        />
      </Field>

      <Field label="Dish type" hint="optional — pasta, soup, one-pan, dessert">
        <input
          value={dishType}
          onChange={(e) => setDishType(e.target.value)}
          placeholder="one-pan"
          className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
        />
      </Field>

      <Field label="Hero ingredients" hint="comma-separated, optional">
        <input
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          placeholder="tomato, basil, garlic"
          className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
        />
      </Field>

      <Field label="Notes" hint="free-form direction">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="aspirational but achievable, lots of color"
          className="w-full bg-white border border-[#252729] rounded-md px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none resize-none"
        />
      </Field>

      <Field label="Recipe language">
        <div className="flex gap-3">
          {(["de", "en"] as const).map((opt) => {
            const active = locale === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setLocale(opt)}
                className="border text-sm font-light py-3 px-6 rounded-full"
                style={{
                  backgroundColor: active ? "#252729" : "#fff",
                  color: active ? "#fff" : "#252729",
                  borderColor: "#252729",
                }}
              >
                {opt === "de" ? "German" : "English"}
              </button>
            );
          })}
        </div>
      </Field>

      {error && (
        <p className="text-xs font-light text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="border border-anthracite bg-anthracite text-white text-sm font-light py-3 rounded-full disabled:opacity-40"
      >
        {submitting ? "Generating candidates…" : "Generate 10 candidates"}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs font-light text-on-surface-variant/70">{hint}</p>
      )}
    </div>
  );
}
