"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildRegionBrief, type RegionWeek } from "@/lib/marketing/region-calendar";

export function RegionOfTheWeekButton({
  week,
  region,
}: {
  week: number;
  region: RegionWeek;
}) {
  const router = useRouter();
  const [locale, setLocale] = useState<"de" | "en">("de");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/admin/campaign-studio/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildRegionBrief(week, region, locale)),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to start run");
      setSubmitting(false);
      return;
    }

    const { runId } = await res.json();
    router.push(`/admin/campaign-studio/runs/${runId}/curate-candidates`);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={submitting}
        className="border border-anthracite bg-white text-anthracite rounded-full px-5 py-3 text-sm font-light text-center disabled:opacity-40"
      >
        {submitting
          ? `Generating ${region.region}…`
          : `🌍 Best dish from · ${region.region}, ${region.country} (KW ${week})`}
      </button>
      <div className="flex gap-3 self-center">
        {(["de", "en"] as const).map((opt) => {
          const active = locale === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => setLocale(opt)}
              disabled={submitting}
              className="border text-xs font-light py-1.5 px-4 rounded-full disabled:opacity-40"
              style={{
                backgroundColor: active ? "#252729" : "#fff",
                color: active ? "#fff" : "#252729",
                borderColor: "#252729",
              }}
            >
              {opt === "de" ? "German" : "English"}
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs font-light text-red-600">{error}</p>}
    </div>
  );
}
