"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface RecipeItem {
  id: string;
  name: string;
  description: string | null;
  photoPath: string | null;
}

function publicUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-photos/${path}`;
}

export function SelectClient({
  galleyId,
  galleyName,
  recipes,
}: {
  galleyId: string;
  galleyName: string;
  recipes: RecipeItem[];
}) {
  const router = useRouter();
  // Default-select recipes that have a photo (usable in "keep" mode).
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(recipes.filter((r) => r.photoPath).map((r) => r.id)),
  );
  const [imageMode, setImageMode] = useState<"keep" | "watercolor">("keep");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/admin/campaign-studio/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        galleyId,
        recipeIds: [...selected],
        imageMode,
        title: title.trim() || undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Import failed");
      setSubmitting(false);
      return;
    }
    router.push(`/admin/campaign-studio/runs/${body.runId}/distribute`);
  }

  const count = selected.size;

  return (
    <div>
      <Link
        href="/admin/campaign-studio/import"
        className="text-xs font-light text-on-surface-variant"
      >
        ← Public galleys
      </Link>
      <h1 className="text-4xl font-thin text-anthracite mt-1 mb-1">{galleyName}</h1>
      <p className="text-xs font-light text-on-surface-variant mb-6">
        Select recipes for the campaign
      </p>

      {/* Image mode */}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
        Images
      </p>
      <div className="flex gap-2 mb-6">
        {(
          [
            ["keep", "Keep existing"],
            ["watercolor", "Watercolor versions"],
          ] as const
        ).map(([mode, label]) => {
          const active = imageMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setImageMode(mode)}
              className="border text-xs font-light py-2 px-4 rounded-full"
              style={{
                backgroundColor: active ? "#252729" : "#fff",
                color: active ? "#fff" : "#252729",
                borderColor: "#252729",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      {imageMode === "watercolor" && (
        <p className="text-[11px] font-light text-on-surface-variant -mt-4 mb-6">
          Generates watercolor images for the post only — the source galley is unchanged.
        </p>
      )}

      {/* Post title */}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
        Post title (optional)
      </p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Leave blank for an AI-generated title"
        className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none mb-6"
      />

      {/* Recipes */}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
        Recipes ({count} selected)
      </p>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {recipes.map((r) => {
          const sel = selected.has(r.id);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => toggle(r.id)}
              className="bg-white rounded-md p-3 shadow-ambient flex flex-col gap-2 text-left"
              style={{ opacity: sel ? 1 : 0.45 }}
            >
              <div className="aspect-square w-full bg-surface-low rounded-md overflow-hidden relative">
                {r.photoPath ? (
                  <Image
                    src={publicUrl(r.photoPath)}
                    alt={r.name}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] font-light text-on-surface-variant">
                    no photo
                  </div>
                )}
              </div>
              <p className="text-sm font-light text-anthracite line-clamp-2">{r.name}</p>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                {sel ? "Selected" : "Tap to add"}
              </span>
            </button>
          );
        })}
      </div>

      {imageMode === "keep" && (
        <p className="text-[11px] font-light text-on-surface-variant mb-3">
          Recipes without a photo get an auto-generated watercolor version so nothing is dropped.
        </p>
      )}
      {error && <p className="text-xs font-light text-red-600 mb-3">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={submitting || count < 2}
        className="w-full border border-anthracite bg-anthracite text-white text-sm font-light py-3 rounded-full disabled:opacity-40"
      >
        {submitting
          ? imageMode === "watercolor"
            ? "Generating watercolor images…"
            : "Importing…"
          : `Import ${count} recipes → Distribute`}
      </button>
    </div>
  );
}
