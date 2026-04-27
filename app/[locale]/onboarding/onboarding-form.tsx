"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function OnboardingForm({
  initialName,
  labels,
}: {
  initialName: string;
  labels: {
    nameLabel: string;
    galleyLabel: string;
    galleyPlaceholder: string;
    submit: string;
    submitting: string;
  };
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [galleyName, setGalleyName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!name.trim() || !galleyName.trim()) return;
    setSubmitting(true);
    setError("");

    const accountRes = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!accountRes.ok) {
      const j = await accountRes.json().catch(() => ({}));
      setError(j.error ?? "Failed to save name");
      setSubmitting(false);
      return;
    }

    const galleyRes = await fetch("/api/galleys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: galleyName.trim() }),
    });
    if (!galleyRes.ok) {
      const j = await galleyRes.json().catch(() => ({}));
      setError(j.error ?? "Failed to create galley");
      setSubmitting(false);
      return;
    }

    router.push("/onboarding/invite");
  }

  const disabled = submitting || !name.trim() || !galleyName.trim();

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
          {labels.nameLabel}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          autoFocus={!initialName}
          className="w-full bg-[#E2E2E2] rounded-md px-4 py-3 text-sm font-light text-anthracite outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
          {labels.galleyLabel}
        </label>
        <input
          type="text"
          value={galleyName}
          onChange={(e) => setGalleyName(e.target.value)}
          placeholder={labels.galleyPlaceholder}
          maxLength={80}
          autoFocus={!!initialName}
          className="w-full bg-[#E2E2E2] rounded-md px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
        />
      </div>
      {error && <p className="text-xs font-light text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={disabled}
        style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
        className="w-full border text-sm font-light py-4 rounded-full disabled:opacity-40"
      >
        {submitting ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
