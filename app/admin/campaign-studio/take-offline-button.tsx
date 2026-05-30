"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Inline "take offline" control for a published run on the studio overview.
// Unpublishes the public landing page. For pipeline-generated galleys it also
// offers to delete the generated galley + recipes; imported galleys are left
// untouched (only the landing page goes offline).
export function TakeOfflineButton({
  runId,
  imported,
}: {
  runId: string;
  imported: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteGalley, setDeleteGalley] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/campaign-studio/runs/${runId}/offline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleteGalley }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to take offline");
      setBusy(false);
      return;
    }
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[10px] font-light text-on-surface-variant underline underline-offset-4 shrink-0 ml-3"
      >
        Take offline
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 shrink-0 ml-3 max-w-[200px]">
      <p className="text-[10px] font-light text-anthracite">
        Take this landing page offline? It will stop resolving.
      </p>
      {!imported && (
        <label className="flex items-start gap-2 text-[10px] font-light text-anthracite">
          <input
            type="checkbox"
            checked={deleteGalley}
            onChange={(e) => setDeleteGalley(e.target.checked)}
            className="mt-0.5 accent-red-500"
          />
          <span>Also delete the generated galley + recipes (permanent)</span>
        </label>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`text-[10px] font-light py-2 px-3 rounded-full disabled:opacity-40 ${
            deleteGalley
              ? "bg-red-500 text-white"
              : "border border-anthracite bg-anthracite text-white"
          }`}
        >
          {busy ? "Working…" : deleteGalley ? "Offline + delete" : "Take offline"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="border border-anthracite bg-white text-anthracite text-[10px] font-light py-2 px-3 rounded-full"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-[10px] font-light text-red-600">{error}</p>}
    </div>
  );
}
