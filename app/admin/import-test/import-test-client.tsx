"use client";

import { useState, useRef } from "react";

type Status = "perfect" | "good" | "partial" | "failed" | "crashed" | "pending" | "running";

interface RowResult {
  url: string;
  status: Status;
  durationMs: number | null;
  name: string | null;
  hasImage: boolean;
  hasPrepTime: boolean;
  ingredientCount: number;
  stepCount: number;
  recipeId: string | null;
  parsedVia: string | null;
  imageSource: string | null;
  error?: string;
}

const STATUS_ICON: Record<Status, string> = {
  perfect: "✓",
  good: "~",
  partial: "△",
  failed: "✗",
  crashed: "✗",
  pending: "·",
  running: "…",
};

const STATUS_COLOR: Record<Status, string> = {
  perfect: "text-green-600",
  good: "text-yellow-600",
  partial: "text-orange-500",
  failed: "text-red-500",
  crashed: "text-red-500",
  pending: "text-on-surface-variant",
  running: "text-anthracite",
};

function scoreResult(data: {
  name?: string | null;
  image_url?: string | null;
  prep_time?: number | null;
  ingredients?: unknown[];
  steps?: unknown[];
}): Status {
  const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : null;
  if (!name) return "partial";
  const hasImage = !!data.image_url;
  const hasPrepTime = typeof data.prep_time === "number" && data.prep_time > 0;
  const ingredients = Array.isArray(data.ingredients) ? data.ingredients.length : 0;
  const steps = Array.isArray(data.steps) ? data.steps.length : 0;
  if (hasImage && hasPrepTime && ingredients >= 1 && steps >= 1) return "perfect";
  if (ingredients >= 1 && steps >= 1) return "good";
  return "partial";
}

function parseUrls(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

export function ImportTestClient({ testKitchenGalleyId }: { testKitchenGalleyId: string }) {
  const [urlText, setUrlText] = useState("");
  const [batchLabel, setBatchLabel] = useState("instagram");
  const [rows, setRows] = useState<RowResult[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef(false);

  const urls = parseUrls(urlText);
  const done = rows.filter((r) => r.status !== "pending" && r.status !== "running");

  const counts = { perfect: 0, good: 0, partial: 0, failed: 0, crashed: 0 };
  for (const r of done) {
    if (r.status in counts) counts[r.status as keyof typeof counts]++;
  }

  async function runTest() {
    if (running || urls.length === 0) return;
    abortRef.current = false;
    setRunning(true);

    const initial: RowResult[] = urls.map((url) => ({
      url,
      status: "pending",
      durationMs: null,
      name: null,
      hasImage: false,
      hasPrepTime: false,
      ingredientCount: 0,
      stepCount: 0,
      recipeId: null,
      parsedVia: null,
      imageSource: null,
    }));
    setRows(initial);

    for (let i = 0; i < urls.length; i++) {
      if (abortRef.current) break;

      setRows((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "running" } : r))
      );

      const t0 = Date.now();
      let result: Partial<RowResult>;

      try {
        const res = await fetch("/api/recipes/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urls[i] }),
          signal: AbortSignal.timeout(45000),
        });

        const durationMs = Date.now() - t0;

        if (!res.ok) {
          let errorMsg = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            if (body.error) errorMsg = body.error;
          } catch { /* ignore */ }
          result = { status: "failed", durationMs, name: null, hasImage: false, hasPrepTime: false, ingredientCount: 0, stepCount: 0, recipeId: null, parsedVia: null, imageSource: null, error: errorMsg };
        } else {
          const data = await res.json();
          const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : null;

          // Save parsed recipe to test-kitchen galley
          let recipeId: string | null = null;
          try {
            const saveRes = await fetch("/api/recipes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: name ?? "Untitled",
                description: data.description ?? null,
                servings: data.servings ?? null,
                prep_time: data.prep_time ?? null,
                season: data.season ?? undefined,
                type: data.type ?? null,
                source_url: urls[i],
                image_url: data.image_url ?? null,
                ingredients: data.ingredients ?? [],
                steps: data.steps ?? [],
                galleyId: testKitchenGalleyId,
              }),
            });
            if (saveRes.ok) {
              const saved = await saveRes.json();
              recipeId = saved.id ?? null;
            }
          } catch { /* non-blocking — parse result still shown */ }

          result = {
            status: scoreResult(data),
            durationMs,
            name,
            hasImage: !!data.image_url,
            hasPrepTime: typeof data.prep_time === "number" && data.prep_time > 0,
            ingredientCount: Array.isArray(data.ingredients) ? data.ingredients.length : 0,
            stepCount: Array.isArray(data.steps) ? data.steps.length : 0,
            recipeId,
            parsedVia: typeof data.parsed_via === "string" ? data.parsed_via : null,
            imageSource: typeof data.image_source === "string" ? data.image_source : null,
          };
        }
      } catch (err) {
        const durationMs = Date.now() - t0;
        result = { status: "crashed", durationMs, name: null, hasImage: false, hasPrepTime: false, ingredientCount: 0, stepCount: 0, recipeId: null, parsedVia: null, imageSource: null, error: err instanceof Error ? err.message : String(err) };
      }

      setRows((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, ...result } : r))
      );

      if (i < urls.length - 1 && !abortRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    setRunning(false);
  }

  function stopTest() {
    abortRef.current = true;
  }

  function downloadReport() {
    const date = new Date().toISOString().slice(0, 10);
    const report = {
      source: batchLabel,
      date,
      total: rows.length,
      counts,
      results: rows.map((r) => ({
        url: r.url,
        status: r.status,
        durationMs: r.durationMs,
        name: r.name,
        hasImage: r.hasImage,
        hasPrepTime: r.hasPrepTime,
        ingredientCount: r.ingredientCount,
        stepCount: r.stepCount,
        parsedVia: r.parsedVia,
        imageSource: r.imageSource,
        ...(r.error ? { error: r.error } : {}),
      })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${date}-${batchLabel}.json`;
    a.click();
  }

  const total = rows.length;
  const pct = (n: number) => total > 0 ? `${Math.round((n / total) * 100)}%` : "—";

  return (
    <div>
      <h1 className="text-4xl font-thin text-anthracite mb-1">Import Test</h1>
      <p className="text-xs font-light text-on-surface-variant mb-8">
        Paste recipe URLs, run the parse pipeline, review results.
      </p>

      {/* Input area */}
      {!running && rows.length === 0 && (
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant block mb-2">
              Batch label
            </label>
            <input
              value={batchLabel}
              onChange={(e) => setBatchLabel(e.target.value)}
              placeholder="e.g. instagram, youtube, website"
              className="w-full bg-white border border-[#252729] rounded-full px-4 py-2.5 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant block mb-2">
              URLs — one per line, # lines are comments
            </label>
            <textarea
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              rows={10}
              placeholder={"https://www.instagram.com/reel/ABC123/\nhttps://www.instagram.com/p/DEF456/"}
              className="w-full bg-white border border-[#252729] rounded-md px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none resize-y"
            />
            <p className="text-xs font-light text-on-surface-variant mt-1">
              {urls.length} URL{urls.length !== 1 ? "s" : ""} detected
              {urls.length > 0 && ` — ~${Math.ceil(urls.length * 2.5 / 60)} min with 2 s delay`}
            </p>
          </div>
          <button
            onClick={runTest}
            disabled={urls.length === 0}
            style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
            className="border text-sm font-light px-6 py-3 rounded-full disabled:opacity-40"
          >
            Run test ({urls.length} URLs)
          </button>
        </div>
      )}

      {/* Results table */}
      {rows.length > 0 && (
        <div>
          {/* Live summary bar */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-4 text-xs font-light text-on-surface-variant">
              {(["perfect", "good", "partial", "failed", "crashed"] as const).map((s) => (
                counts[s] > 0 ? (
                  <span key={s} className={STATUS_COLOR[s]}>
                    {s} {counts[s]} ({pct(counts[s])})
                  </span>
                ) : null
              ))}
              {done.length < total && (
                <span>{done.length}/{total} done</span>
              )}
            </div>
            <div className="flex gap-3">
              {running && (
                <button
                  onClick={stopTest}
                  style={{ backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
                  className="border text-xs font-light px-4 py-2 rounded-full"
                >
                  Stop
                </button>
              )}
              {!running && (
                <>
                  <button
                    onClick={downloadReport}
                    style={{ backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
                    className="border text-xs font-light px-4 py-2 rounded-full"
                  >
                    Download JSON
                  </button>
                  <button
                    onClick={() => { setRows([]); setUrlText(""); }}
                    style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
                    className="border text-xs font-light px-4 py-2 rounded-full"
                  >
                    New batch
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="bg-white rounded-md shadow-ambient overflow-hidden">
            <table className="w-full text-xs font-light">
              <thead>
                <tr className="border-b border-surface-low">
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant w-8">#</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Status</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Name</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Img</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Time</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Ing</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Steps</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Parsed via</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Img src</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">ms</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Recipe</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-surface-low last:border-0">
                    <td className="px-4 py-2.5 text-on-surface-variant">{i + 1}</td>
                    <td className={`px-4 py-2.5 font-semibold ${STATUS_COLOR[row.status]}`}>
                      {STATUS_ICON[row.status]} {row.status}
                    </td>
                    <td className="px-4 py-2.5 text-anthracite max-w-[200px]">
                      {row.name ? (
                        <span className="block truncate" title={row.name}>{row.name}</span>
                      ) : row.error ? (
                        <span className="text-red-400 truncate block" title={row.error}>{row.error}</span>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">{row.status === "pending" || row.status === "running" ? "·" : row.hasImage ? "✓" : "✗"}</td>
                    <td className="px-4 py-2.5 text-center">{row.status === "pending" || row.status === "running" ? "·" : row.hasPrepTime ? "✓" : "✗"}</td>
                    <td className="px-4 py-2.5 text-center text-anthracite">{row.status === "pending" || row.status === "running" ? "·" : row.ingredientCount}</td>
                    <td className="px-4 py-2.5 text-center text-anthracite">{row.status === "pending" || row.status === "running" ? "·" : row.stepCount}</td>
                    <td className="px-4 py-2.5 text-on-surface-variant">{row.parsedVia ?? "·"}</td>
                    <td className="px-4 py-2.5 text-on-surface-variant">{row.imageSource ?? "·"}</td>
                    <td className="px-4 py-2.5 text-right text-on-surface-variant">{row.durationMs != null ? row.durationMs.toLocaleString() : "·"}</td>
                    <td className="px-4 py-2.5 text-center">
                      {row.recipeId ? (
                        <a
                          href={`/recipe/${row.recipeId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-anthracite underline underline-offset-2"
                        >
                          ↗
                        </a>
                      ) : (
                        <span className="text-on-surface-variant">·</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Final summary */}
          {!running && done.length === total && (
            <div className="mt-6 bg-white rounded-md shadow-ambient p-4 space-y-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-3">
                  Summary — {batchLabel} — {total} URLs
                </p>
                <div className="grid grid-cols-5 gap-3">
                  {(["perfect", "good", "partial", "failed", "crashed"] as const).map((s) => (
                    <div key={s}>
                      <p className={`text-2xl font-thin ${STATUS_COLOR[s]}`}>{counts[s]}</p>
                      <p className="text-[10px] font-light text-on-surface-variant">{s}</p>
                      <p className="text-[10px] font-light text-on-surface-variant">{pct(counts[s])}</p>
                    </div>
                  ))}
                </div>
              </div>

              {(() => {
                type Bucket = { total: number; perfect: number; good: number; partial: number; failed: number; crashed: number; withImage: number };
                const groups = new Map<string, Bucket>();
                for (const r of done) {
                  const key = r.parsedVia ?? "(unknown)";
                  let b = groups.get(key);
                  if (!b) { b = { total: 0, perfect: 0, good: 0, partial: 0, failed: 0, crashed: 0, withImage: 0 }; groups.set(key, b); }
                  b.total++;
                  if (r.status in b) (b as unknown as Record<string, number>)[r.status]++;
                  if (r.hasImage) b.withImage++;
                }
                const sorted = [...groups.entries()].sort((a, b) => b[1].total - a[1].total);
                if (sorted.length === 0) return null;
                return (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-3">
                      Breakdown by parse path
                    </p>
                    <table className="w-full text-xs font-light">
                      <thead>
                        <tr className="border-b border-surface-low">
                          <th className="text-left py-1.5 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Parsed via</th>
                          <th className="text-right py-1.5 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Total</th>
                          <th className="text-right py-1.5 text-[10px] font-semibold uppercase tracking-widest text-green-600">Perfect</th>
                          <th className="text-right py-1.5 text-[10px] font-semibold uppercase tracking-widest text-yellow-600">Good</th>
                          <th className="text-right py-1.5 text-[10px] font-semibold uppercase tracking-widest text-orange-500">Partial</th>
                          <th className="text-right py-1.5 text-[10px] font-semibold uppercase tracking-widest text-red-500">Fail</th>
                          <th className="text-right py-1.5 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">w/ photo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map(([key, b]) => (
                          <tr key={key} className="border-b border-surface-low last:border-0">
                            <td className="py-1.5 text-anthracite">{key}</td>
                            <td className="py-1.5 text-right text-anthracite">{b.total}</td>
                            <td className="py-1.5 text-right text-green-600">{b.perfect}</td>
                            <td className="py-1.5 text-right text-yellow-600">{b.good}</td>
                            <td className="py-1.5 text-right text-orange-500">{b.partial}</td>
                            <td className="py-1.5 text-right text-red-500">{b.failed + b.crashed}</td>
                            <td className="py-1.5 text-right text-on-surface-variant">{b.withImage}/{b.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
