"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewRunForm() {
  const router = useRouter();
  const [theme, setTheme] = useState("");
  const [notes, setNotes] = useState("");
  const [locale, setLocale] = useState<"en" | "de">("de");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!theme.trim()) {
      setError("Theme is required.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/admin/campaign-studio/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: theme.trim(),
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
      <Field
        label="Theme"
        hint="The one thing this galley is about. Be specific — narrow themes produce better candidates."
      >
        <input
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="Healthy high-protein kids meals · German spring asparagus · Italian weeknight pasta"
          className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
        />
      </Field>

      <Field
        label="Direction"
        hint="Optional · constraints, mood, hero ingredients, what to avoid"
      >
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="No dairy, dishes that kids actually love, mix of mains and snacks"
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
