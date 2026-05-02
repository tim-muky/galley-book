"use client";

import { useState } from "react";
import type { TagKind } from "@/types/database";

export interface TagInput {
  kind: TagKind;
  value: string;
}

const KIND_ORDER: TagKind[] = ["cuisine", "type", "season", "ingredient"];

const KIND_LABELS: Record<TagKind, string> = {
  cuisine: "Cuisine",
  type: "Type",
  season: "Season",
  ingredient: "Main ingredients",
};

const KIND_PLACEHOLDERS: Record<TagKind, string> = {
  cuisine: "e.g. italian",
  type: "e.g. main",
  season: "e.g. summer",
  ingredient: "e.g. chicken",
};

interface Props {
  tags: TagInput[];
  onChange: (tags: TagInput[]) => void;
  labels?: Partial<Record<TagKind, string>>;
}

export function TagEditor({ tags, onChange, labels }: Props) {
  return (
    <div className="space-y-4">
      {KIND_ORDER.map((kind) => (
        <KindRow
          key={kind}
          kind={kind}
          label={labels?.[kind] ?? KIND_LABELS[kind]}
          tags={tags.filter((t) => t.kind === kind)}
          onAdd={(value) => {
            const normalized = value.trim().toLowerCase();
            if (!normalized) return;
            if (tags.some((t) => t.kind === kind && t.value === normalized)) return;
            onChange([...tags, { kind, value: normalized }]);
          }}
          onRemove={(value) => onChange(tags.filter((t) => !(t.kind === kind && t.value === value)))}
        />
      ))}
    </div>
  );
}

function KindRow({
  kind,
  label,
  tags,
  onAdd,
  onRemove,
}: {
  kind: TagKind;
  label: string;
  tags: TagInput[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft("");
  }

  return (
    <div>
      <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-2">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <span
            key={`${t.kind}::${t.value}`}
            className="inline-flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full text-sm font-light border border-anthracite bg-white text-anthracite"
          >
            <span className="capitalize">{t.value}</span>
            <button
              type="button"
              onClick={() => onRemove(t.value)}
              aria-label={`Remove ${t.value}`}
              className="w-5 h-5 flex items-center justify-center rounded-full text-on-surface-variant"
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path d="M1.5 1.5l6 6M7.5 1.5l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          placeholder={KIND_PLACEHOLDERS[kind]}
          className="flex-1 min-w-[8rem] bg-white border border-[#252729] rounded-full px-3 py-1 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none focus-visible:ring-2 focus-visible:ring-anthracite focus-visible:ring-offset-2"
        />
      </div>
    </div>
  );
}
