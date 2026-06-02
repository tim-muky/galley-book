"use client";

import { useState } from "react";

/** Pause / resume a single ad (creative) from the per-creative table. */
export function CreativeControls({ adId }: { adId: string }) {
  const [busy, setBusy] = useState<"pause_ad" | "resume_ad" | null>(null);
  const [state, setState] = useState<"active" | "paused" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "pause_ad" | "resume_ad") {
    setBusy(action);
    setError(null);
    const res = await fetch("/api/admin/campaign-studio/ads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, adId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? "Action failed");
    else setState(action === "pause_ad" ? "paused" : "active");
    setBusy(null);
  }

  return (
    <div className="flex items-center gap-2">
      {state === "paused" ? (
        <button
          type="button"
          onClick={() => run("resume_ad")}
          disabled={busy !== null}
          className="border border-anthracite bg-anthracite text-white text-xs font-light py-1.5 px-4 rounded-full disabled:opacity-40"
        >
          {busy === "resume_ad" ? "Resuming…" : "Resume"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => run("pause_ad")}
          disabled={busy !== null}
          className="border border-anthracite bg-white text-anthracite text-xs font-light py-1.5 px-4 rounded-full disabled:opacity-40"
        >
          {busy === "pause_ad" ? "Pausing…" : "Pause"}
        </button>
      )}
      {state === "paused" && <span className="text-[10px] font-light text-on-surface-variant">paused</span>}
      {error && <span className="text-[10px] font-light text-red-600">{error}</span>}
    </div>
  );
}
