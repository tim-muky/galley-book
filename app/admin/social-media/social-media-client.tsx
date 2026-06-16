"use client";

import { useEffect, useRef, useState } from "react";

const FOLLOW_DELAY_S = 30;

export type FollowCandidate = {
  id: string;
  handle: string;
  display_name: string | null;
  category: string | null;
  region: string | null;
  note: string | null;
  follower_tier: string | null;
  status: "suggested" | "followed" | "skipped" | "invalid";
  needs_verify: boolean;
};

export function SocialMediaClient({ initial }: { initial: FollowCandidate[] }) {
  const [items, setItems] = useState<FollowCandidate[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // id → seconds left before auto-marking followed
  const [pending, setPending] = useState<Record<string, number>>({});
  const timers = useRef<
    Record<string, { interval: ReturnType<typeof setInterval>; timeout: ReturnType<typeof setTimeout> }>
  >({});

  useEffect(() => {
    const current = timers.current;
    return () => {
      Object.values(current).forEach((t) => {
        clearInterval(t.interval);
        clearTimeout(t.timeout);
      });
    };
  }, []);

  const suggested = items.filter((i) => i.status === "suggested");
  const followed = items.filter((i) => i.status === "followed").length;
  const skipped = items.filter((i) => i.status === "skipped" || i.status === "invalid").length;

  function clearTimer(id: string) {
    const t = timers.current[id];
    if (t) {
      clearInterval(t.interval);
      clearTimeout(t.timeout);
      delete timers.current[id];
    }
    setPending((p) => {
      if (!(id in p)) return p;
      const next = { ...p };
      delete next[id];
      return next;
    });
  }

  async function mark(id: string, status: "followed" | "skipped" | "invalid") {
    clearTimer(id); // cancel any pending auto-follow before applying
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

  // Open the IG profile and start the 30s "assume followed" countdown. Skip /
  // Wrong / Cancel within the window aborts it (the IG API can't confirm a
  // follow, so this is the pragmatic substitute).
  function openAndFollow(c: FollowCandidate) {
    window.open(`https://instagram.com/${c.handle}`, "_blank", "noopener,noreferrer");
    if (timers.current[c.id]) return;
    setPending((p) => ({ ...p, [c.id]: FOLLOW_DELAY_S }));
    const interval = setInterval(() => {
      setPending((p) => (c.id in p ? { ...p, [c.id]: Math.max(0, p[c.id] - 1) } : p));
    }, 1000);
    const timeout = setTimeout(() => {
      clearTimer(c.id);
      void mark(c.id, "followed");
    }, FOLLOW_DELAY_S * 1000);
    timers.current[c.id] = { interval, timeout };
  }

  return (
    <div>
      <h1 className="text-4xl font-thin text-anthracite mb-1">Social Media Management</h1>
      <p className="text-xs font-light text-on-surface-variant mb-6">
        Instagram follow queue. <span className="text-anthracite">Open &amp; Follow</span> opens the
        profile and auto-marks it Followed after 30s — tap Skip, Wrong, or Cancel within the window
        if you didn&apos;t follow. Aim for 10–50 per week.
      </p>

      {/* Progress */}
      <div className="flex gap-3 mb-6">
        {[
          { label: "To follow", value: suggested.length },
          { label: "Followed", value: followed },
          { label: "Skipped / wrong", value: skipped },
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
          {suggested.map((c) => {
            const secs = pending[c.id];
            const isPending = secs !== undefined;
            return (
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
                {c.needs_verify && (
                  <p className="text-[11px] font-light text-amber-700 mb-1">
                    ⚠️ Handle unverified — check the profile opens to the right account before
                    following.
                  </p>
                )}
                {c.note && (
                  <p className="text-xs font-light text-on-surface-variant/80 mb-3">{c.note}</p>
                )}
                <div className="flex gap-2 items-center flex-wrap">
                  {isPending ? (
                    <>
                      <span className="text-xs font-light text-anthracite">
                        Marking followed in {secs}s…
                      </span>
                      <button
                        type="button"
                        onClick={() => clearTimer(c.id)}
                        className="border border-anthracite bg-white text-on-surface-variant text-xs font-light py-2 px-4 rounded-full"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openAndFollow(c)}
                      className="border border-anthracite bg-anthracite text-white text-xs font-light py-2 px-4 rounded-full"
                    >
                      Open &amp; Follow ↗
                    </button>
                  )}
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
                  <button
                    type="button"
                    onClick={() => mark(c.id, "invalid")}
                    disabled={busy === c.id}
                    className="border border-red-300 bg-white text-red-600 text-xs font-light py-2 px-4 rounded-full disabled:opacity-40"
                    title="Wrong account / dead handle — remove from the queue"
                  >
                    🚩 Wrong
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
