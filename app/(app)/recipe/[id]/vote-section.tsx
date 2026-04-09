"use client";

import { useState } from "react";

export function VoteSection({
  recipeId,
  initialVote,
}: {
  recipeId: string;
  initialVote: number | null;
}) {
  const [vote, setVote] = useState<number | null>(initialVote);
  const [saving, setSaving] = useState(false);

  async function handleVote(value: number) {
    if (saving) return;
    setSaving(true);
    setVote(value);
    await fetch("/api/votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId, value }),
    });
    setSaving(false);
  }

  return (
    <section className="pb-6">
      <h2 className="text-lg font-light text-anthracite mb-3">Rate this recipe</h2>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((val) => (
          <button
            key={val}
            onClick={() => handleVote(val)}
            disabled={saving}
            className={`text-xl transition-opacity disabled:cursor-not-allowed ${
              vote !== null && vote >= val ? "opacity-100" : "opacity-30 hover:opacity-60"
            }`}
          >
            ★
          </button>
        ))}
      </div>
    </section>
  );
}
