"use client";

import { useState } from "react";

interface BringButtonProps {
  recipeId: string;
  servings?: number;
  baseServings?: number;
}

export function BringButton({ recipeId, servings = 4, baseServings = 4 }: BringButtonProps) {
  const [loading, setLoading] = useState(false);

  async function addToBring() {
    setLoading(true);
    try {
      const res = await fetch("/api/bring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeId,
          requestedQuantity: servings,
          baseQuantity: baseServings,
        }),
      });

      if (!res.ok) throw new Error("Failed to get Bring deeplink");
      const { deeplink } = await res.json();

      // Open Bring app or fall back to web
      window.location.href = deeplink;
    } catch (err) {
      console.error(err);
      alert("Could not open Bring. Make sure the app is installed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={addToBring}
      disabled={loading}
      style={{ backgroundColor: "#252729", color: "#fff" }}
      className="w-full flex items-center justify-center gap-2.5 font-light text-sm rounded-full py-4 px-6 transition-opacity hover:opacity-80 active:opacity-70 disabled:opacity-40"
    >
      {/* Bring! shopping bag icon */}
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 5h12l-1.5 9H4.5L3 5z" stroke="white" strokeWidth="1.3" strokeLinejoin="round"/>
        <path d="M6.5 5V3.5A2.5 2.5 0 0111.5 3.5V5" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
      {loading ? "Opening Bring…" : "Add to Shopping List"}
    </button>
  );
}
