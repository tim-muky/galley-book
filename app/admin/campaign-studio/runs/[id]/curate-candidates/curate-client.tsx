"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface RunCandidate {
  name: string;
  oneLiner: string;
  tags: string[];
  course?: string;
  keep: boolean;
}

export function CurateCandidatesClient({
  runId,
  initialCandidates,
}: {
  runId: string;
  initialCandidates: RunCandidate[];
}) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<RunCandidate[]>(initialCandidates);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keptCount = candidates.filter((c) => c.keep).length;

  function update(i: number, patch: Partial<RunCandidate>) {
    setCandidates((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function addCustom() {
    setCandidates((cs) => [
      ...cs,
      { name: "", oneLiner: "", tags: [], keep: true },
    ]);
  }

  async function onContinue() {
    setSubmitting(true);
    setError(null);
    const kept = candidates.filter((c) => c.keep && c.name.trim() && c.oneLiner.trim());
    if (kept.length < 3) {
      setError("Keep at least 3 candidates before generating images.");
      setSubmitting(false);
      return;
    }

    const saveRes = await fetch(`/api/admin/campaign-studio/runs/${runId}/candidates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidates }),
    });
    if (!saveRes.ok) {
      const body = await saveRes.json().catch(() => ({}));
      setError(body.error ?? "Failed to save curation");
      setSubmitting(false);
      return;
    }

    // Image generation is the next step. The endpoint kicks it off and
    // returns; the curate-images page polls for completion.
    const genRes = await fetch(`/api/admin/campaign-studio/runs/${runId}/generate-images`, {
      method: "POST",
    });
    if (!genRes.ok) {
      const body = await genRes.json().catch(() => ({}));
      setError(body.error ?? "Failed to start image generation");
      setSubmitting(false);
      return;
    }

    router.push(`/admin/campaign-studio/runs/${runId}/curate-images`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
          {keptCount} of {candidates.length} kept
        </span>
        <button
          type="button"
          onClick={addCustom}
          className="border border-anthracite bg-white text-anthracite text-xs font-light py-2 px-4 rounded-full"
        >
          + Add custom
        </button>
      </div>

      <div className="flex flex-col gap-3 mb-6">
        {candidates.map((c, i) => (
          <CandidateRow key={i} candidate={c} onUpdate={(patch) => update(i, patch)} />
        ))}
      </div>

      {error && (
        <p className="text-xs font-light text-red-600 mb-3">{error}</p>
      )}

      <button
        type="button"
        onClick={onContinue}
        disabled={submitting}
        className="w-full border border-anthracite bg-anthracite text-white text-sm font-light py-3 rounded-full disabled:opacity-40"
      >
        {submitting ? "Saving + generating images…" : `Generate images for ${keptCount} recipes`}
      </button>
    </div>
  );
}

function CandidateRow({
  candidate,
  onUpdate,
}: {
  candidate: RunCandidate;
  onUpdate: (patch: Partial<RunCandidate>) => void;
}) {
  return (
    <div
      className="bg-white rounded-md p-4 shadow-ambient flex flex-col gap-2"
      style={{ opacity: candidate.keep ? 1 : 0.5 }}
    >
      <div className="flex items-start gap-3">
        <label className="flex items-center gap-2 text-xs font-light text-on-surface-variant pt-2 shrink-0">
          <input
            type="checkbox"
            checked={candidate.keep}
            onChange={(e) => onUpdate({ keep: e.target.checked })}
            className="w-4 h-4"
          />
          Keep
        </label>
        <div className="flex-1 flex flex-col gap-2">
          {candidate.course && (
            <span className="self-start text-[10px] font-semibold uppercase tracking-widest text-anthracite bg-surface-low rounded-full px-2 py-0.5">
              {candidate.course}
            </span>
          )}
          <input
            value={candidate.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="Recipe name"
            className="w-full bg-transparent text-sm font-light text-anthracite outline-none border-b border-transparent focus:border-anthracite"
          />
          <textarea
            value={candidate.oneLiner}
            onChange={(e) => onUpdate({ oneLiner: e.target.value })}
            rows={2}
            placeholder="One-liner"
            className="w-full bg-transparent text-xs font-light text-on-surface-variant outline-none resize-none border-b border-transparent focus:border-anthracite"
          />
          <div className="flex flex-wrap gap-1">
            {candidate.tags.map((tag, ti) => (
              <span
                key={ti}
                className="text-[10px] font-light text-on-surface-variant bg-surface-low rounded-full px-2 py-0.5"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
