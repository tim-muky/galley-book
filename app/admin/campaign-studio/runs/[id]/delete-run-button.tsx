"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteRunButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setDeleting(true);
    setError(null);
    const res = await fetch(`/api/admin/campaign-studio/runs/${runId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to delete");
      setDeleting(false);
      return;
    }
    router.push("/admin/campaign-studio");
    router.refresh();
  }

  if (!confirm) {
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="text-xs font-light text-on-surface-variant underline underline-offset-4"
      >
        Delete run
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-light text-anthracite">Delete this run permanently?</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="bg-red-500 text-white text-xs font-light py-2 px-4 rounded-full disabled:opacity-40"
        >
          {deleting ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          type="button"
          onClick={() => setConfirm(false)}
          disabled={deleting}
          className="border border-anthracite bg-white text-anthracite text-xs font-light py-2 px-4 rounded-full"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs font-light text-red-600">{error}</p>}
    </div>
  );
}
