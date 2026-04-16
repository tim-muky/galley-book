"use client";

import { useState } from "react";

// The icon from the reference: a "C" arc (circle open on the right) with a + inside.
// Active (in list) = anthracite fill, white icon. Inactive = frosted white, anthracite icon.
function CookNextIcon({ color = "#252729" }: { color?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      {/* C-arc: starts upper-right, goes counter-clockwise through left, ends lower-right */}
      <path
        d="M11 2.7A5.5 5.5 0 1 0 11 12.3"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Plus sign */}
      <path
        d="M7.5 5v5M5 7.5h5"
        stroke={color}
        strokeWidth="1.5"
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
