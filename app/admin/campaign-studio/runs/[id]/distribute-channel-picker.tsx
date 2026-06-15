"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Channel picker on the published-run screen (GAL-456). Lets the admin choose
 * which channels to distribute to before opening the Distribute screen; the
 * selection is carried as a `?channels=` query param and the Distribute screen
 * renders only those sections.
 *
 * Facebook is listed but disabled until the FB publishing channel ships
 * (GAL-453) — shown so the set of channels is obvious, not actionable yet.
 */
const CHANNELS = [
  { key: "instagram", label: "Instagram", enabled: true },
  { key: "tiktok", label: "TikTok", enabled: true },
  { key: "facebook", label: "Facebook", enabled: false, note: "soon" },
  { key: "meta", label: "Meta Ads", enabled: true },
] as const;

export function DistributeChannelPicker({ runId }: { runId: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(CHANNELS.filter((c) => c.enabled).map((c) => c.key)),
  );

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const chosen = CHANNELS.filter((c) => c.enabled && selected.has(c.key)).map((c) => c.key);

  return (
    <div className="bg-white rounded-md p-4 shadow-ambient mb-6">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-3">
        Distribute to
      </p>
      <div className="flex flex-col gap-3 mb-4">
        {CHANNELS.map((c) => {
          const checked = c.enabled && selected.has(c.key);
          return (
            <label
              key={c.key}
              className={`flex items-center gap-3 text-sm font-light ${
                c.enabled ? "text-anthracite cursor-pointer" : "text-on-surface-variant/50 cursor-not-allowed"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!c.enabled}
                onChange={() => toggle(c.key)}
                className="w-4 h-4 accent-[#252729] disabled:opacity-40"
              />
              {c.label}
              {!c.enabled && c.note ? (
                <span className="text-[10px] uppercase tracking-widest text-on-surface-variant/60">
                  {c.note}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      <button
        type="button"
        disabled={chosen.length === 0}
        onClick={() =>
          router.push(
            `/admin/campaign-studio/runs/${runId}/distribute?channels=${chosen.join(",")}`,
          )
        }
        className="w-full border border-anthracite bg-anthracite text-white text-sm font-light py-3 rounded-full disabled:opacity-40"
      >
        Distribute →
      </button>
    </div>
  );
}
