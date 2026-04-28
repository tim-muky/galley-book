# Runbook

What breaks in production and how to fix it. Skewed toward the
third-party fragility we've actually hit, not theoretical failure modes.

## Recipe parsing — `/api/recipes/parse`

### Symptom: every Instagram parse returns "Instagram posts cannot be parsed automatically"
The `embed/captioned/` HTML is empty or the `<img class="EmbeddedMediaImage">`
selector no longer matches. Instagram has been moving these endpoints to a
CSR React app since Apr 2026 (see comment at top of
[`lib/parsers/instagram.ts`](../lib/parsers/instagram.ts)).

**First check**: does the embed URL load at all in a browser?
- `https://www.instagram.com/p/<shortcode>/embed/captioned/`

**Mitigation**:
1. Inspect the HTML — find the new selector for the post photo and update
   `extractInstagramEmbedImage` in `lib/parsers/instagram.ts`.
2. The Perplexity fallback still works for *most* posts even when the embed
   does not — confirm in the import-test admin UI.
3. If the embed is fully broken, all parses will route through Perplexity →
   higher cost (~$0.005 → $0.02 per recipe).

### Symptom: every YouTube parse returns "Could not extract a recipe"
Most likely the watch-page JSON shape changed and `extractYtInitialPlayer`
in [`lib/parsers/youtube.ts`](../lib/parsers/youtube.ts) returns null.
Confirmed pattern: GAL-152 / GAL-159 (Apr 2026).

**First check**: do the import-test logs show `parsedVia: youtube_description`
or `youtube_transcript` succeeding for *some* URLs? If yes, the parser
is fine and the test set is full of caption-less videos.

**Mitigation**:
- Strategy 3 (oEmbed for title only) always works — verify it's still
  returning a title in production logs.
- Gemini video analysis (`youtube_video`) costs more but is independent of
  watch-page scraping; it only fails on age-gated / private videos.
- Perplexity fallback (`youtube_perplexity`) should still find the recipe
  via web search for popular creators.

### Symptom: site returns "Could not extract a recipe from this URL"
The dispatcher fetched the page directly, fell through to Perplexity, and
Perplexity also couldn't access it. Three flavours, only one is fixable:

| Pattern | Recognise it by | What to do |
| --- | --- | --- |
| **Cloudflare bot challenge** | direct fetch returns 403 with ~6KB body containing `challenge-platform` or `cf_chl_opt` | Nothing client-side works. Richer headers (`Sec-Fetch-*`, `Sec-Ch-Ua`) do not bypass it — verified for fattoincasadabenedetta.it, lacuisinedebernard.com, akispetretzikis.com. Only mitigation is a headless browser or a paid bypass service. |
| **404 / page moved** | direct fetch returns 404 | URL is dead. Drop it from any test set and re-share the link. |
| **JSON-LD present but missing Recipe block** | direct fetch returns 200, has JSON-LD, but `@type: Recipe` not found | Working as designed — Perplexity fallback runs and may succeed. If it returns only a summary, the page genuinely doesn't have machine-readable recipe data. |

When a previously-working site starts failing, fetch it locally with curl:
```bash
curl -sI -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" "<url>"
```
Compare the status + body size to the table above to pick the right bucket.

### Symptom: lots of `parse_link` failures with "504"
Perplexity is overloaded. We retry once on 504 (see `fetchViaPerplexity` in
[`lib/parsers/perplexity.ts`](../lib/parsers/perplexity.ts)) but a second 504
returns empty content.

**Check**: Vercel logs for the rate of 504 responses from
`api.perplexity.ai`. Cross-check status at https://status.perplexity.ai.

**Mitigation**: there is none on our side. The failure is platform-specific
— Instagram and TikTok degrade hard since they depend heavily on
Perplexity; YouTube and websites have other paths (transcript, JSON-LD).

### Symptom: "Recipe parsing is not configured." (503)
`GOOGLE_AI_API_KEY` is missing. Check Vercel env vars; redeploy after
fixing.

## AI cost / Gemini quotas

### Symptom: Gemini calls return 429 / 500 with quota messages
Hit the Google AI Studio quota for the project. Daily and per-minute limits
both apply.

**Check**: `/admin/ai-cost` to see the call rate over the past 30 days.
**Mitigation**: enable billing in Google AI Studio (or upgrade tier). The
project is on the free tier by default — fine for prototype scale, breaks
at ~50 parses/day per user.

## Cron — `/api/cron/cleanup-temp-images`

Runs daily 03:00 UTC, deletes `recipe-photos/temp/*` older than 24h. Auth
header: `Authorization: Bearer ${CRON_SECRET}`.

### Symptom: Storage usage growing forever
Cron isn't running or `CRON_SECRET` is missing. Test manually:
```bash
curl -H "Authorization: Bearer ${CRON_SECRET}" \
  https://app.galleybook.com/api/cron/cleanup-temp-images
```
Expected: `{"deleted": <n>}`. 401 means env var missing or wrong; redeploy
after fixing.

## Rate limiting

Backed by Upstash Redis. Limits in [`lib/rate-limit.ts`](../lib/rate-limit.ts).
Failures are conservative — if the Upstash call itself fails the limiter
allows the request through. Effectively no global circuit breaker.

### Symptom: legitimate users getting 429s
Either the limit is too tight or the limiter key is being computed wrong
(check the key includes `userId`, not just IP — IP buckets misbehave behind
NAT).

## Bring! deeplinks — `/share/[token]`

The Bring! parser scrapes our `/share/[token]` page and expects
Schema.org `itemprop="recipeIngredient"` in the HTML.

### Symptom: Bring! deeplink opens with empty ingredients
1. Visit `/share/<token>` directly — make sure the JSON-LD is in the HTML
   *response*, not injected client-side.
2. `proxy.ts` must bypass next-intl on the `/share/*` path so the response
   isn't a redirect (see GAL-172). Build will fail loudly if this regresses
   — there's a `prebuild` script (`scripts/check-share-bypass.ts`) that
   greps for it.

## Supabase

### Symptom: random 500s on recipe creation after a migration
Generated types in `types/database.ts` are stale. Run:
```bash
npm run types
```
This regenerates from the live schema and re-appends `types/app-types.ts`
(GAL-169 fix).

### Symptom: `recipe_translations` upsert fails
`recipe_translations` is in the live DB but its migration file isn't in
`supabase/migrations/`. If you're setting up a fresh project, dump the
schema first via `supabase db dump --data-only=false` and add the missing
DDL as a new migration file.
