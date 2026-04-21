"use client";

import { useState } from "react";

interface Props {
  recipeId: string;
  otherGalleys: { id: string; name: string }[];
  className?: string;
}

export function RecipeContextMenu({ recipeId, otherGalleys, className }: Props) {
  const [open, setOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [toast, setToast] = useState("");

  async function copyToGalley(targetGalleyId: string) {
    setCopying(true);
    setOpen(false);
    const res = await fetch(`/api/recipes/${recipeId}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetGalleyId }),
    });
    setCopying(false);
    if (res.ok) {
      setToast("Copied!");
      setTimeout(() => setToast(""), 2500);
    }
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        disabled={copying}
        aria-label="Recipe options"
        className={`w-8 h-8 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-full transition-opacity disabled:opacity-40 ${className ?? ""}`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="2.5" r="1.2" fill="white" />
          <circle cx="7" cy="7" r="1.2" fill="white" />
          <circle cx="7" cy="11.5" r="1.2" fill="white" />
        </svg>
      </button>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-anthracite text-white text-xs font-light px-4 py-2 rounded-full shadow-ambient pointer-events-none">
          {toast}
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl px-5 pt-5 pb-10"
            style={{ boxShadow: "0 -8px 40px rgba(0,0,0,0.08)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-8 h-1 bg-surface-low rounded-full mx-auto mb-5" />
            <p className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-4">
              Copy to Galley
            </p>
            <div className="space-y-2">
              {otherGalleys.map((g) => (
                <button
                  key={g.id}
                  onClick={() => copyToGalley(g.id)}
                  disabled={copying}
                  style={{ backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
                  className="w-full border text-sm font-light py-3 rounded-full transition-opacity disabled:opacity-40"
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
