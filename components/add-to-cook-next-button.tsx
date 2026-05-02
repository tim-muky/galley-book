"use client";

import { useState } from "react";

function CookNextIcon({ color = "#252729" }: { color?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 22 22" fill="none">
      <path
        d="M7.5 2.5c-1 1.3 1 2.4 0 3.7M11 2.5c-1 1.3 1 2.4 0 3.7M14.5 2.5c-1 1.3 1 2.4 0 3.7"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M2.5 8.5h17"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M3.75 8.5 5 17.25c0.18 1.27 1.27 2.25 2.55 2.25h6.9c1.28 0 2.37-0.98 2.55-2.25L18.25 8.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface AddToCookNextButtonProps {
  recipeId: string;
  initialInList: boolean;
  /** Extra Tailwind/inline classes — use for positioning (e.g. "absolute top-2 right-2 z-10") */
  className?: string;
}

export function AddToCookNextButton({
  recipeId,
  initialInList,
  className = "",
}: AddToCookNextButtonProps) {
  const [inList, setInList] = useState(initialInList);
  const [loading, setLoading] = useState(false);

  async function handleToggle(e: React.MouseEvent) {
    // Prevent triggering any parent Link navigation
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      if (inList) {
        const res = await fetch(`/api/cook-next-list/${recipeId}`, { method: "DELETE" });
        if (res.ok) setInList(false);
      } else {
        const res = await fetch("/api/cook-next-list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipeId }),
        });
        if (res.ok) setInList(true);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      aria-label={inList ? "Remove from Cook Next" : "Add to Cook Next"}
      className={`w-11 h-11 flex items-center justify-center rounded-full shadow-ambient transition-opacity disabled:opacity-40 active:opacity-70 ${className}`}
      style={{
        backgroundColor: inList ? "#252729" : "rgba(255,255,255,0.80)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <CookNextIcon color={inList ? "#ffffff" : "#252729"} />
    </button>
  );
}
