"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface PublicGalley {
  id: string;
  name: string;
  recipeCount: number;
}

export function ImportClient() {
  const [q, setQ] = useState("");
  const [galleys, setGalleys] = useState<PublicGalley[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(
        `/api/admin/campaign-studio/public-galleys?q=${encodeURIComponent(q)}`,
      );
      if (res.ok) setGalleys((await res.json()).galleys);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <Link href="/admin/campaign-studio" className="text-xs font-light text-on-surface-variant">
        ← Studio
      </Link>
      <h1 className="text-4xl font-thin text-anthracite mt-1 mb-1">Import public galley</h1>
      <p className="text-xs font-light text-on-surface-variant mb-6">
        Turn an existing public galley into a campaign
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search public galleys…"
        className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none mb-4"
      />

      {loading && galleys.length === 0 ? (
        <p className="text-xs font-light text-on-surface-variant">Searching…</p>
      ) : galleys.length === 0 ? (
        <p className="text-xs font-light text-on-surface-variant">No public galleys found.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {galleys.map((g) => (
            <Link
              key={g.id}
              href={`/admin/campaign-studio/import/${g.id}`}
              className="bg-white rounded-md px-4 py-3 shadow-ambient flex items-center justify-between"
            >
              <span className="text-sm font-light text-anthracite truncate">{g.name}</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant shrink-0 ml-3">
                {g.recipeCount} recipes
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
