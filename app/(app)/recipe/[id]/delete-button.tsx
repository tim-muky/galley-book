"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteRecipeButton({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/recipes/${recipeId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/library");
      router.refresh();
    } else {
      setDeleting(false);
      setConfirm(false);
      alert("Failed to delete recipe.");
    }
  }

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        style={{ backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
        className="w-full border text-sm font-light py-3 rounded-full transition-opacity"
      >
        Delete Recipe
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-light text-center text-on-surface-variant">
        This recipe will be hidden from your library. You can restore it in Settings.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => setConfirm(false)}
          style={{ backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
          className="flex-1 border text-sm font-light py-3 rounded-full"
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
          className="flex-1 border text-sm font-light py-3 rounded-full transition-opacity disabled:opacity-40"
        >
          {deleting ? "Deleting…" : "Yes, Delete"}
        </button>
      </div>
    </div>
  );
}
