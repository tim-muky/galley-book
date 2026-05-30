"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export interface RunCandidateWithImage {
  name: string;
  oneLiner: string;
  tags: string[];
  keep: boolean;
  imagePath?: string;
  imagePrompt?: string;
}

function publicUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-photos/${path}`;
}

export function CurateImagesClient({
  runId,
  initialCandidates,
  runStatus,
  initialGalleyName,
}: {
  runId: string;
  initialCandidates: RunCandidateWithImage[];
  runStatus: string;
  initialGalleyName: string;
}) {
  const router = useRouter();
  const [candidates, setCandidates] = useState(initialCandidates);
  const [pending, setPending] = useState(runStatus === "images_pending");
  const [regenerating, setRegenerating] = useState<Set<number>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [galleyName, setGalleyName] = useState(initialGalleyName);
  const [error, setError] = useState<string | null>(null);

  // Poll for completion while images are still generating. If the polling
  // endpoint keeps failing (>3 consecutive), surface an error and stop —
  // previously this silently swallowed errors and left the user staring at a
  // stuck "pending" state forever.
  useEffect(() => {
    if (!pending) return;
    let consecutiveFailures = 0;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/campaign-studio/runs/${runId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        consecutiveFailures = 0;
        const data = await res.json();
        setCandidates(data.candidates);
        if (data.status !== "images_pending") {
          setPending(false);
        }
      } catch {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 3) {
          setError("Lost contact with the image-generation job. Refresh to retry.");
          setPending(false);
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [pending, runId]);

  const kept = candidates.filter((c) => c.keep && c.name.trim());
  const allHaveImages = kept.every((c) => c.imagePath);

  async function regenerate(index: number) {
    setRegenerating((s) => new Set(s).add(index));
    setError(null);

    // Clear the existing imagePath so the bulk generate endpoint picks it up
    const cleared = candidates.map((c, i) =>
      i === index ? { ...c, imagePath: undefined } : c,
    );
    await fetch(`/api/admin/campaign-studio/runs/${runId}/candidates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidates: cleared }),
    });

    const res = await fetch(`/api/admin/campaign-studio/runs/${runId}/generate-images`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to regenerate");
    } else {
      const fresh = await fetch(`/api/admin/campaign-studio/runs/${runId}`);
      if (fresh.ok) setCandidates((await fresh.json()).candidates);
    }
    setRegenerating((s) => {
      const next = new Set(s);
      next.delete(index);
      return next;
    });
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    const res = await fetch(`/api/admin/campaign-studio/runs/${runId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ galleyName: galleyName.trim() || undefined }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to publish");
      setPublishing(false);
      return;
    }
    router.push(`/admin/campaign-studio/runs/${runId}`);
  }

  return (
    <div>
      {pending && (
        <div className="bg-white rounded-md px-4 py-3 shadow-ambient text-xs font-light text-on-surface-variant mb-4">
          Generating images… this can take a few minutes.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
        {candidates.map((c, i) =>
          c.keep && c.name.trim() ? (
            <ImageCard
              key={i}
              candidate={c}
              regenerating={regenerating.has(i)}
              onRegenerate={() => regenerate(i)}
            />
          ) : null,
        )}
      </div>

      <div className="flex flex-col gap-2 mb-4">
        <label className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
          Galley name
        </label>
        <input
          value={galleyName}
          onChange={(e) => setGalleyName(e.target.value)}
          placeholder="Galley of the Week — KW XX"
          className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite outline-none"
        />
      </div>

      {error && <p className="text-xs font-light text-red-600 mb-3">{error}</p>}

      <button
        type="button"
        onClick={publish}
        disabled={publishing || pending || !allHaveImages}
        className="w-full border border-anthracite bg-anthracite text-white text-sm font-light py-3 rounded-full disabled:opacity-40"
      >
        {publishing
          ? "Publishing galley…"
          : !allHaveImages
            ? "Waiting for all images…"
            : `Publish galley (${kept.length} recipes)`}
      </button>
    </div>
  );
}

function ImageCard({
  candidate,
  regenerating,
  onRegenerate,
}: {
  candidate: RunCandidateWithImage;
  regenerating: boolean;
  onRegenerate: () => void;
}) {
  return (
    <div className="bg-white rounded-md p-3 shadow-ambient flex flex-col gap-2">
      <div className="aspect-square w-full bg-surface-low rounded-md overflow-hidden relative">
        {candidate.imagePath ? (
          <Image
            src={publicUrl(candidate.imagePath)}
            alt={candidate.name}
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs font-light text-on-surface-variant">
            {regenerating ? "Generating…" : "No image yet"}
          </div>
        )}
      </div>
      <p className="text-sm font-light text-anthracite line-clamp-2">{candidate.name}</p>
      <button
        type="button"
        onClick={onRegenerate}
        disabled={regenerating}
        className="border border-anthracite bg-white text-anthracite text-[11px] font-light py-1.5 rounded-full disabled:opacity-40"
      >
        {regenerating ? "…" : candidate.imagePath ? "Regenerate" : "Generate"}
      </button>
    </div>
  );
}
