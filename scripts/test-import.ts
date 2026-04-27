#!/usr/bin/env npx tsx
/**
 * Recipe import test runner — GAL-113
 *
 * Usage:
 *   npx tsx scripts/test-import.ts urls/instagram.txt
 *
 * Env vars required:
 *   TEST_SESSION_COOKIE  — value of the `sb-*` cookie from a logged-in browser session
 *
 * Env vars optional:
 *   BASE_URL             — default: https://www.galleybook.com
 */

import fs from "fs";
import path from "path";

const BASE_URL = process.env.BASE_URL ?? "https://www.galleybook.com";
const SESSION_COOKIE = process.env.TEST_SESSION_COOKIE ?? "";
const DELAY_MS = 2000;
// Slightly above the parse route's 60s maxDuration so a real server timeout
// surfaces as the route's own 422, not a client-side abort.
const REQUEST_TIMEOUT_MS = 65000;

const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "instagram.com",
  "www.instagram.com",
  "tiktok.com",
  "www.tiktok.com",
  "vm.tiktok.com",
]);

/** Validate a URL line. Returns the trimmed URL or a reason it's invalid.
 *  Catches typos like missing scheme ("tps://...") or wrong host before they
 *  hit the server and inflate the failure count. Generic websites are allowed
 *  through (no host check) since the test set may include any cooking blog. */
function lintUrl(line: string, sourceFile: string): { ok: true; url: string } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(line);
  } catch {
    return { ok: false, reason: "not a valid URL (check scheme, e.g. missing 'ht' before 'tps://')" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: `unsupported scheme ${parsed.protocol}` };
  }
  // Only enforce host allowlist for known social-media test files; generic
  // site lists pass through.
  const baseName = path.basename(sourceFile, path.extname(sourceFile)).toLowerCase();
  const isSocial = ["youtube", "instagram", "tiktok"].some((s) => baseName.includes(s));
  if (isSocial && !ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    return { ok: false, reason: `host ${parsed.hostname} not in allowlist for ${baseName}` };
  }
  return { ok: true, url: line };
}

type Status = "perfect" | "good" | "partial" | "failed" | "crashed";

interface RecipeResult {
  url: string;
  status: Status;
  durationMs: number;
  name: string | null;
  hasImage: boolean;
  hasPrepTime: boolean;
  ingredientCount: number;
  stepCount: number;
  error?: string;
}

function score(r: Omit<RecipeResult, "status" | "url" | "durationMs">): Status {
  const { name, hasImage, hasPrepTime, ingredientCount, stepCount } = r;
  if (!name) return "partial";
  const hasIngredients = ingredientCount >= 1;
  const hasSteps = stepCount >= 1;
  if (name && hasImage && hasPrepTime && hasIngredients && hasSteps) return "perfect";
  if (name && hasIngredients && hasSteps) return "good";
  return "partial";
}

async function parseUrl(url: string): Promise<RecipeResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/recipes/parse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SESSION_COOKIE ? { Cookie: SESSION_COOKIE } : {}),
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const durationMs = Date.now() - t0;

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body.error) errorMsg = body.error;
      } catch { /* ignore */ }
      return { url, status: "failed", durationMs, name: null, hasImage: false, hasPrepTime: false, ingredientCount: 0, stepCount: 0, error: errorMsg };
    }

    const data = await res.json();
    const fields = {
      name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : null,
      hasImage: !!data.image_url,
      hasPrepTime: typeof data.prep_time === "number" && data.prep_time > 0,
      ingredientCount: Array.isArray(data.ingredients) ? data.ingredients.length : 0,
      stepCount: Array.isArray(data.steps) ? data.steps.length : 0,
    };

    return { url, status: score(fields), durationMs, ...fields };
  } catch (err) {
    const durationMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    return { url, status: "crashed", durationMs, name: null, hasImage: false, hasPrepTime: false, ingredientCount: 0, stepCount: 0, error: msg };
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const urlFile = process.argv[2];
  if (!urlFile) {
    console.error("Usage: npx tsx scripts/test-import.ts <url-file>");
    process.exit(1);
  }

  if (!SESSION_COOKIE) {
    console.error("Error: TEST_SESSION_COOKIE env var is required.");
    console.error("  Copy the Cookie header from a logged-in browser request to galleybook.com");
    process.exit(1);
  }

  const raw = fs.readFileSync(urlFile, "utf-8");
  const lines = raw
    .split("\n")
    .map((l, i) => ({ line: l.trim(), lineNumber: i + 1 }))
    .filter((l) => l.line && !l.line.startsWith("#"));

  const urls: string[] = [];
  const skipped: { line: number; raw: string; reason: string }[] = [];
  for (const { line, lineNumber } of lines) {
    const result = lintUrl(line, urlFile);
    if (result.ok) urls.push(result.url);
    else skipped.push({ line: lineNumber, raw: line, reason: result.reason });
  }

  if (skipped.length > 0) {
    console.warn(`\nSkipping ${skipped.length} malformed URL(s):`);
    for (const s of skipped) {
      console.warn(`  line ${s.line}: ${s.raw}`);
      console.warn(`    ↳ ${s.reason}`);
    }
  }

  if (urls.length === 0) {
    console.error("No valid URLs found in file.");
    process.exit(1);
  }

  const source = path.basename(urlFile, path.extname(urlFile));
  console.log(`\n${source} batch — ${urls.length} URLs`);
  console.log(`Target: ${BASE_URL}\n`);

  const results: RecipeResult[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    process.stdout.write(`  [${i + 1}/${urls.length}] ${url.slice(0, 70)} ... `);
    const result = await parseUrl(url);
    results.push(result);

    const icon = result.status === "perfect" ? "✓" : result.status === "good" ? "~" : result.status === "partial" ? "△" : "✗";
    console.log(`${icon} ${result.status} (${result.durationMs}ms)`);
    if (result.error) console.log(`          ↳ ${result.error}`);

    if (i < urls.length - 1) await sleep(DELAY_MS);
  }

  // Tally
  const counts: Record<Status, number> = { perfect: 0, good: 0, partial: 0, failed: 0, crashed: 0 };
  for (const r of results) counts[r.status]++;
  const total = results.length;

  const pct = (n: number) => `${Math.round((n / total) * 100)}%`.padStart(4);

  console.log(`\n${source} batch — ${total} URLs`);
  for (const [status, count] of Object.entries(counts) as [Status, number][]) {
    if (count > 0 || status === "perfect") {
      console.log(`  ${status.padEnd(8)} ${String(count).padStart(3)} (${pct(count)})`);
    }
  }

  // Write JSON report
  const date = new Date().toISOString().slice(0, 10);
  const outDir = "test-results";
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${date}-${source}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ source, date, total, counts, results }, null, 2));
  console.log(`\nReport: ${outPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
