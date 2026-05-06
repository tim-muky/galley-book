"use client";

import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { TagKind } from "@/types/database";
import { TAG_KINDS, type TagFilters } from "@/lib/recipe-filters";

interface AvailableTag {
  value: string;
  count: number;
}

interface Props {
  filters: TagFilters;
  available: Record<TagKind, AvailableTag[]>;
  search: string;
}

const KIND_LABELS: Record<TagKind, string> = {
  cuisine: "Cuisine",
  type: "Type",
  season: "Season",
  ingredient: "Ingredient",
};

export function LibraryFilters({ filters, available, search }: Props) {
  const router = useRouter();
  const t = useTranslations("library");
  const [expanded, setExpanded] = useState<TagKind | null>(null);
  // GAL-284: collapse the per-kind picker block by default. Auto-open when
  // the page loads with active filters in the URL so users can see what's
  // selected and adjust without an extra tap.
  const hasInitialFilters =
    filters.cuisine.length + filters.type.length + filters.season.length + filters.ingredient.length > 0;
  const [filtersOpen, setFiltersOpen] = useState(hasInitialFilters);

  function buildHref(next: TagFilters): string {
    const sp = new URLSearchParams();
    if (search) sp.set("search", search);
    for (const kind of TAG_KINDS) {
      if (next[kind].length > 0) sp.set(kind, next[kind].join(","));
    }
    const qs = sp.toString();
    return qs ? `/library?${qs}` : "/library";
  }

  function navigate(next: TagFilters) {
    router.push(buildHref(next));
  }

  function toggleTag(kind: TagKind, value: string) {
    const cur = filters[kind];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    navigate({ ...filters, [kind]: next });
  }

  function clearAll() {
    router.push(search ? `/library?search=${encodeURIComponent(search)}` : "/library");
  }

  const hasFilters =
    filters.cuisine.length + filters.type.length + filters.season.length + filters.ingredient.length > 0;

  const totalAvailable = TAG_KINDS.reduce((n, k) => n + available[k].length, 0);

  return (
    <div className="mb-6">
      {/* Active filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-hide">
        {TAG_KINDS.flatMap((kind) =>
          filters[kind].map((value) => (
            <button
              key={`${kind}::${value}`}
              type="button"
              onClick={() => toggleTag(kind, value)}
              style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
              className="flex-shrink-0 inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-xs font-light border capitalize"
            >
              <span>{value}</span>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path d="M1.5 1.5l6 6M7.5 1.5l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          ))
        )}
        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-light text-on-surface-variant"
          >
            Clear
          </button>
        )}
      </div>

      {/* Single "Filters" toggle that reveals/hides the per-kind picker */}
      {totalAvailable > 0 && (
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className="mt-1 inline-flex items-center gap-1.5 py-1.5 text-xs font-semibold text-anthracite uppercase tracking-widest"
        >
          <span>Filters</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            style={{ transform: filtersOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            <path d="M2 3.5L5 6.5l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Per-kind disclosure rows — only shown when there are tags to pick */}
      {totalAvailable > 0 && filtersOpen && (
        <div className="mt-2 space-y-1">
          {TAG_KINDS.map((kind) => {
            const options = available[kind];
            if (options.length === 0) return null;
            const isOpen = expanded === kind;
            const selectedCount = filters[kind].length;
            return (
              <div key={kind}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : kind)}
                  className="w-full flex items-center justify-between py-2 text-xs font-semibold text-anthracite uppercase tracking-wide"
                >
                  <span>
                    {KIND_LABELS[kind]}
                    {selectedCount > 0 && (
                      <span className="ml-2 text-on-surface-variant font-light normal-case tracking-normal">
                        {selectedCount} selected
                      </span>
                    )}
                  </span>
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                  >
                    <path d="M2 3.5L5 6.5l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="flex gap-2 flex-wrap pb-2">
                    {options.map((opt) => {
                      const active = filters[kind].includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => toggleTag(kind, opt.value)}
                          style={
                            active
                              ? { backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }
                              : { backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }
                          }
                          className="px-3 py-1 rounded-full text-xs font-light border capitalize"
                        >
                          {opt.value}
                          <span className="ml-1.5 text-[10px] opacity-60">{opt.count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
