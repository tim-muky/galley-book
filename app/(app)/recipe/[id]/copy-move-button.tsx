"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/routing";

interface Props {
  recipeId: string;
  otherGalleys: { id: string; name: string }[];
}

export function CopyMoveButton({ recipeId, otherGalleys }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  async function copyToGalley(targetGalleyId: string) {
    setLoading(`copy-${targetGalleyId}`);
    const res = await fetch(`/api/recipes/${recipeId}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetGalleyId }),
    });
    setLoading(null);
    setOpen(false);
    if (res.ok) {
      setToast("Recipe copied!");
      setTimeout(() => setToast(""), 2500);
    }
  }

  async function moveToGalley(targetGalleyId: string) {
    setLoading(`move-${targetGalleyId}`);
    const res = await fetch(`/api/recipes/${recipeId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetGalleyId }),
    });
    setLoading(null);
    if (res.ok) {
      router.push("/library");
      router.refresh();
    } else {
      setOpen(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{ backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
        className="w-full border text-sm font-light py-3 rounded-full"
      >
        Copy or Move to Galley
      </button>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-anthracite text-white text-xs font-light px-4 py-2 rounded-full shadow-ambient pointer-events-none">
          {toast}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl px-5 pt-5 pb-10"
            style={{ boxShadow: "0 -8px 40px rgba(0,0,0,0.08)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-8 h-1 bg-surface-low rounded-full mx-auto mb-5" />
            <p className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-5">
              Copy or Move to Galley
            </p>
            <div className="space-y-4">
              {otherGalleys.map((g) => (
                <div key={g.id}>
                  <p className="text-sm font-light text-on-surface-variant mb-2">{g.name}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyToGalley(g.id)}
                      disabled={!!loading}
                      style={{ backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
                      className="flex-1 border text-sm font-light py-3 rounded-full disabled:opacity-40"
                    >
                      {loading === `copy-${g.id}` ? "Copying…" : "Copy"}
                    </button>
                    <button
                      onClick={() => moveToGalley(g.id)}
                      disabled={!!loading}
                      style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
                      className="flex-1 border text-sm font-light py-3 rounded-full disabled:opacity-40"
                    >
                      {loading === `move-${g.id}` ? "Moving…" : "Move"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
