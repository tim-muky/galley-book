# API Routes

All routes live under `app/api/`. Every authenticated route follows the
pattern documented in [CLAUDE.md](../CLAUDE.md#api-route-pattern): `await
createClient()` → `getUser()` → 401 if missing → handler. Routes that mutate
data return JSON with explicit status codes (201 / 200 / 400 / 401 / 403 /
404 / 422 / 429 / 500).

## Recipes

| Method | Path | Auth | Rate limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/recipes?galleyId&cursor&filter&search&limit` | user | — | List recipes in a galley with optional filter / search |
| POST | `/api/recipes` | user | — | Create a recipe (atomic via `create_recipe_with_children` RPC, GAL-166) |
| PUT | `/api/recipes/[id]` | user | — | Replace a recipe (full update) |
| PATCH | `/api/recipes/[id]` | user | — | Partial update (e.g. soft-delete via `deleted_at`) |
| DELETE | `/api/recipes/[id]` | user | — | Hard delete a recipe |
| POST | `/api/recipes/[id]/copy` | user | — | Clone a recipe into another galley you're a member of |
| POST | `/api/recipes/[id]/move` | user | — | Move a recipe to another galley you own |
| POST | `/api/recipes/[id]/photos` | user | — | Upload a photo (multipart) |
| POST | `/api/recipes/[id]/translate` | user | translate | Gemini translation into the user's `translation_language` |
| GET | `/api/recipes/[id]/comments` (via direct read) | user | — | Comments on a recipe (RLS-scoped, see GAL-119) |
| POST | `/api/recipes/[id]/comments` | user | — | Post a comment |
| DELETE | `/api/recipes/[id]/comments/[commentId]` | user / galley owner | — | Delete a comment |
| POST | `/api/recipes/parse` | user | parse | Parse a URL → structured recipe (Gemini, see [parsers](#parsers)) |
| POST | `/api/recipes/parse-image` | user | parse | Parse a photo → structured recipe (Gemini multimodal) |

## Galleys & Members

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/galleys` | user | Create a galley + owner membership |
| PATCH | `/api/galleys/[id]` | galley owner | Rename a galley |
| DELETE | `/api/galleys/[id]` | galley owner | Delete a galley (cascades) |
| PATCH | `/api/galleys/[id]/default` | user | Mark this galley as the user's `is_default` |
| POST | `/api/galleys/[id]/header-image` | galley owner | Upload header image (multipart) |
| DELETE | `/api/galleys/members/[userId]` | galley owner | Remove a member |
| POST | `/api/invites` | galley owner | Generate a one-time invite |
| POST | `/api/invites/link` | user | Accept an invite via token |

The user's "active galley" everywhere outside `/settings` resolves through
[`lib/active-galley.ts`](../lib/active-galley.ts) — cookie → `is_default` →
earliest membership (GAL-137).

## Cook Next

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/cook-next` | user | AI-curated next-to-cook list (Perplexity, GAL-90) |
| POST | `/api/cook-next/vote` | user | Thumbs up / down — thumbs down returns a replacement |
| GET | `/api/cook-next-list` | user | All recipes the galley pinned for "cook next" |
| POST | `/api/cook-next-list` | user | Pin a recipe (`{recipeId}`) |
| DELETE | `/api/cook-next-list` | user | Clear all |
| DELETE | `/api/cook-next-list/[recipeId]` | user | Unpin one |

## Recommendations & Sources

| Method | Path | Auth | Rate limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/recommendations?cuisine&ingredient` | user | recs | Perplexity discovery against galley's saved sources |
| POST | `/api/sources` | user | — | Add a recommendation source (Instagram / YouTube / TikTok / website) |
| DELETE | `/api/sources/[id]` | user | — | Remove a source |
| POST | `/api/discover/memory` | user | — | Mark a recommended URL as seen |

## Bring!, Votes, Account

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/bring` | user | Generate Bring! deeplink for `recipeId` |
| POST | `/api/votes` | user | Rate a recipe |
| PATCH | `/api/account` | user | Update name / username / `translation_language` |
| DELETE | `/api/account` | user | Delete account + cascade |

## Public / Infrastructure

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/proxy-image?url` | user | Fetch Instagram CDN images with the right Referer (allowlisted hosts only, GAL-163) |
| POST | `/api/feedback` | user | Send feedback email via Resend |
| POST | `/api/waitlist` | none | Public waitlist signup |
| GET | `/api/cron/cleanup-temp-images` | `Authorization: Bearer ${CRON_SECRET}` | Daily 03:00 UTC — deletes orphaned `recipe-photos/temp/*` older than 24h (GAL-138) |

## Parsers

`POST /api/recipes/parse` is a thin handler. URL-specific scraping lives in
[`lib/parsers/`](../lib/parsers/) (GAL-164):

- `instagram.ts` — embed scrape + CDN image caching
- `youtube.ts` — watch-page meta, transcript, video analysis, thumbnails
- `tiktok.ts` — oEmbed
- `website.ts` — JSON-LD, og:image, HTML text fallback
- `perplexity.ts` — search fallback used by all of the above
- `index.ts` — `fetchPageContent(url)` dispatcher

## Rate limits

Defined in [`lib/rate-limit.ts`](../lib/rate-limit.ts). Backed by
Upstash Redis (sliding window). Limits return `429` + `Retry-After`.

| Limiter | Bucket | Used by |
| --- | --- | --- |
| `parse` | per-user | `/api/recipes/parse`, `/api/recipes/parse-image` |
| `translate` | per-user | `/api/recipes/[id]/translate` |
| `recs` | per-user | `/api/recommendations` |

## Schemas

Request bodies are validated with `zod`. The schema is defined inline at the
top of each handler — see e.g. `RecipeCreateSchema` in
[`app/api/recipes/route.ts`](../app/api/recipes/route.ts) or `ParseSchema` in
[`app/api/recipes/parse/route.ts`](../app/api/recipes/parse/route.ts).
