# GAL-180: Web Import-Test Delta vs GAL-173 Baseline

**Date:** 2026-05-12  
**Status:** BLOCKED — auth cookie and web URL test files unavailable

---

**One-line summary:** BLOCKED — `TEST_SESSION_COOKIE` env var not available and web URL test files (Web 1/2/3) are absent from `urls/`

---

## What Was Attempted

The automated runner (`scripts/test-import.ts`) was investigated and found to require two prerequisites that were not met in this environment:

1. **`TEST_SESSION_COOKIE`** — the script exits immediately if this env var is not set (line 168–171 of `scripts/test-import.ts`). No authenticated session cookie for `app.galleybook.com` was available in this CI environment.

2. **Web URL test files** — the `urls/` directory contains only `instagram.txt` and `youtube.txt`. The three web test files referenced in GAL-173 (`web1.txt` / `web2.txt` / `web3.txt`, or equivalent filenames covering 24 + 41 + 37 = 102 URLs) are absent. Without them there is no test corpus to run.

Both blockers must be resolved before the delta analysis can proceed.

---

## Blockers

### Blocker 1 — Missing auth cookie

The script enforces:

```ts
if (!SESSION_COOKIE) {
  console.error("Error: TEST_SESSION_COOKIE env var is required.");
  process.exit(1);
}
```

**Fix:** Export a valid Supabase session cookie from a logged-in browser session on `app.galleybook.com` and set `TEST_SESSION_COOKIE=<value>` before invoking the script.

### Blocker 2 — Web URL test files missing from repository

`ls urls/` returns:

```
instagram.txt
youtube.txt
```

The 102-URL web corpus from GAL-173 (Web 1: 24 URLs, Web 2: 41 URLs, Web 3: 37 URLs) is not committed to the repo.

**Fix:** Commit `urls/web1.txt`, `urls/web2.txt`, and `urls/web3.txt` (the same files used for the GAL-173 baseline run) so the test runner can find them.

---

## GAL-173 Baseline (for reference when the run eventually succeeds)

| File | perfect | good | partial | failed | crashed | total |
|------|---------|------|---------|--------|---------|-------|
| Web 1 (web1.txt) | 8 | 10 | 0 | 6 | 0 | 24 |
| Web 2 (web2.txt) | 20 | 6 | 5 | 8 | 1 | 41 |
| Web 3 (web3.txt) | 18 | 5 | 3 | 5 | 0 | 37 |
| **Total** | **46** | **21** | **8** | **19** | **1** | **102** |

### Per-URL Spot-Checks Pending (GAL-174 / 175 / 176 / 178 / 179)

| URL | Baseline | Expected after fixes | Actual |
|-----|----------|---------------------|--------|
| https://www.lecker.de/kaesespaetzle-rezept-82474.html | name = "Pumpkin Spice Latte" | name matches slug (käsespätzle) — GAL-174 | ⚠️ not run |
| https://www.kochbar.de/rezept/529837/Spaghetti-Carbonara.html | name = "Maronencremesuppe…" | name matches slug (spaghetti carbonara) — GAL-174 | ⚠️ not run |
| https://www.meillakotona.fi/reseptit/meheva-raparperipiirakka | 14 ing, 0 steps | stepCount > 0 — GAL-175 | ⚠️ not run |
| https://www.meillakotona.fi/reseptit/chili-riisipasteija-ja-ramenliemi | 19 ing, 0 steps | stepCount > 0 — GAL-175 | ⚠️ not run |
| https://www.gustos.ro/retete-culinare/sarailie-reteta-simpla-si-delicioasa-explicata-pas-cu-pas.html | 8 ing, 0 steps | stepCount > 0 — GAL-175 | ⚠️ not run |
| https://www.recepty.cz/recept/poctive-pecene-kure-9555 | 5 ing, 0 steps | stepCount > 0 — GAL-175 | ⚠️ not run |
| https://www.directoalpaladar.com/recetas-de-aperitivos/como-hacer-chorizos-a-la-sidra-receta | 3 ing, 0 steps | stepCount > 0 — GAL-175 | ⚠️ not run |
| https://kurier.at/freizeit/rezepte/geheimtipps-spitzenkoch-apfelstrudel-aufgetischt/402903073 | failed (Recipe stub) | good/perfect via Perplexity — GAL-176 | ⚠️ not run |
| https://lekker.nl/recepten/pistache-kardemom-pavlovas-van-lynn-van-de-vorst | failed (Recipe stub) | good/perfect via Perplexity — GAL-176 | ⚠️ not run |
| https://syntages.gr/r/1127/syntages-syntagi-tzatziki | error "Invalid or disallowed URL" | error "This URL doesn't resolve…" — GAL-178 | ⚠️ not run |
| various perplexity-route rows | hasImage: false | hasImage: true on ≥50% more rows — GAL-179 | ⚠️ not run |

---

## How to Re-Run

Once both blockers are resolved:

```bash
# Set auth cookie from a logged-in browser session
export TEST_SESSION_COOKIE="sb-<project-ref>-auth-token=<value>"
export BASE_URL="https://app.galleybook.com"

mkdir -p tmp

# Run all three web batches
npx tsx scripts/test-import.ts urls/web1.txt
npx tsx scripts/test-import.ts urls/web2.txt
npx tsx scripts/test-import.ts urls/web3.txt

# Results are written to test-results/<date>-web{1,2,3}.json
```

Then compare `counts` from each JSON against the GAL-173 baseline table above and update this document with actual results + regressions.
