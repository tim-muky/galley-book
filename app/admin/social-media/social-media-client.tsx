"use client";

import { useState } from "react";

export type FollowCandidate = {
  id: string;
  handle: string;
  display_name: string | null;
  category: string | null;
  region: string | null;
  note: string | null;
  follower_tier: string | null;
  status: "suggested" | "followed" | "skipped";
};

export function SocialMediaClient({ initial }: { initial: FollowCandidate[] }) {
  const [items, setItems] = useState<FollowCandidate[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suggested = items.filter((i) => i.status === "suggested");
  const followed = items.filter((i) => i.status === "followed").length;
  const skipped = items.filter((i) => i.status === "skipped").length;

  async function mark(id: string, status: "followed" | "skipped") {
    setBusy(id);
    setError(null);
    const res = await fetch("/api/admin/social-media/candidates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to update");
      setBusy(null);
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    setBusy(null);
  }

  return (
    <div>
      <h1 className="text-4xl font-thin text-anthracite mb-1">Social Media Management</h1>
      <p className="text-xs font-light text-on-surface-variant mb-6">
        Instagram follow queue — open each profile, tap Follow on Instagram, then mark it here. Aim
        for 10–50 per week.
      </p>

      {/* Progress */}
      <div className="flex gap-3 mb-6">
        {[
          { label: "To follow", value: suggested.length },
          { label: "Followed", value: followed },
          { label: "Skipped", value: skipped },
        ].map((s) => (
          <div key={s.label} className="bg-surface-low rounded-md px-4 py-3 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
              {s.label}
            </p>
            <p className="text-2xl font-thin text-anthracite">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Follow-back note */}
      <div className="bg-surface-low rounded-md p-4 mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
          Follow-back (manual)
        </p>
        <p className="text-xs font-light text-on-surface-variant">
          Instagram&apos;s API can&apos;t read who follows you, so follow-back can&apos;t be
          automated. Check @galleybook&apos;s new followers in the app and follow back the relevant
          food/recipe accounts — a quick weekly pass.
        </p>
      </div>

      {error && <p className="text-xs font-light text-red-600 mb-4">{error}</p>}

      {/* Queue */}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-3">
        Suggested to follow ({suggested.length})
      </p>
      {suggested.length === 0 ? (
        <p className="text-sm font-light text-on-surface-variant">
          Queue empty — everything has been actioned. 🎉
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {suggested.map((c) => (
            <div key={c.id} className="bg-surface-lowest rounded-md px-4 py-3 shadow-ambient">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <p className="text-sm font-light text-anthracite">
                  {c.display_name || `@${c.handle}`}
                </p>
                {c.follower_tier && (
                  <span className="text-xs font-light text-on-surface-variant shrink-0">
                    {c.follower_tier}
                  </span>
                )}
              </div>
              <p className="text-xs font-light text-on-surface-variant mb-1">
                @{c.handle}
                {c.category ? ` · ${c.category}` : ""}
                {c.region ? ` · ${c.region}` : ""}
              </p>
              {c.note && (
                <p className="text-xs font-light text-on-surface-variant/80 mb-3">{c.note}</p>
              )}
              <div className="flex gap-2">
                <a
                  href={`https://instagram.com/${c.handle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-anthracite bg-anthracite text-white text-xs font-light py-2 px-4 rounded-full"
                >
                  Open & Follow ↗
                </a>
                <button
                  type="button"
                  onClick={() => mark(c.id, "followed")}
                  disabled={busy === c.id}
                  className="border border-anthracite bg-white text-anthracite text-xs font-light py-2 px-4 rounded-full disabled:opacity-40"
                >
                  {busy === c.id ? "…" : "Followed ✓"}
                </button>
                <button
                  type="button"
                  onClick={() => mark(c.id, "skipped")}
                  disabled={busy === c.id}
                  className="border border-anthracite bg-white text-on-surface-variant text-xs font-light py-2 px-4 rounded-full disabled:opacity-40"
                >
                  Skip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
