"use client";

import { useState } from "react";

export function CreateGalleyForm({
  placeholder,
  buttonLabel,
}: {
  placeholder: string;
  buttonLabel: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");

  return (
    <form
      action="/api/galleys"
      method="POST"
      onSubmit={() => setSubmitting(true)}
    >
      <input
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-surface-highest rounded-sm px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none mb-4"
      />
      <button
        type="submit"
        disabled={submitting || !name.trim()}
        style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
        className="w-full border text-sm font-light py-4 rounded-full disabled:opacity-40"
      >
        {buttonLabel}
      </button>
    </form>
  );
}
