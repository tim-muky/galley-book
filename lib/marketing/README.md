# Marketing asset generation

Shared library for galleybook's generated marketing imagery and recipe content.
Used by Campaign Studio (the "Galley of the Week" pipeline) and any other
generated marketing asset.

## Files

- **`watercolor-style.ts`** — the brand style anchor for all generated imagery.
  Exports the positive/negative style prompts, aspect-ratio dimensions, the
  default + fallback image models, and `buildWatercolorPrompt()` which assembles
  a fully-formed request for the image layer.
- **`generate-recipes.ts`** — the three-step content layer the pipeline calls in
  order: `generateRecipeCandidates(brief)` → `generateRecipeImage(candidate)` →
  `expandRecipe(candidate)`.
- **`meta-ads.ts`** / **`meta-config.ts`** — the Meta Marketing API layer (GAL-391).
  See [Meta Marketing API](#meta-marketing-api-gal-391).
- **`instagram.ts`** / **`capi.ts`** — organic IG Graph API publishing and the
  server-side Conversions API.

## Visual tone

The look is **soft watercolor**, matching the existing app illustrations in
`public/onboarding/*.png` (the canonical veggie set). Hold this tone across every
food category — it must not drift into photorealism or cartoon.

- Hand-painted with visible brushstrokes and gentle bleed edges
- Warm, muted palette: ochre, sage, terracotta, dusty rose, parchment
- White / off-white background, isolated subject, no scene clutter
- Loose organic linework, slight irregularity, paper grain visible
- Editorial cookbook aesthetic — **food-as-still-life**
- **Not**: photorealism, 3D render, CGI, cartoon, flat vector, neon, high saturation

## Style anchors

Four reference images for image-to-image conditioning live in
`public/admin/style-anchors/` (`asparagus`, `beets`, `carrots`, `kale`),
mirrored from the onboarding illustration set. `WATERCOLOR_STYLE_ANCHORS` in
`watercolor-style.ts` is the source of truth for the list.

## Models

Routed through the Vercel AI Gateway so providers can be swapped without touching
call sites:

| Role | Model | Notes |
|---|---|---|
| Image (default) | `google/imagen-4.0-generate-001` | cleanest watercolor textures |
| Image (fallback) | `openai/gpt-image-2` | used on Imagen quota/rejection |
| Candidates + expansion | `google/gemini-3.5-flash` | cheap iteration |

## Prompt convention

Subject goes **first** (models weigh early tokens heavier), then optional
composition direction, then the style block — so the watercolor look is applied
to the right subject rather than producing a generic watercolor scene.

## Meta Marketing API (GAL-391)

`meta-ads.ts` pushes generated ad creatives into the standing Advantage+ campaign
(GAL-54), controls budget/state, and reads insights for the dashboard. Call sites:
the "Push to Meta" button on a published run (`/api/admin/campaign-studio/runs/[id]/distribute/meta-push`)
and the budget/pause controls in the dashboard (`/api/admin/campaign-studio/ads`).

### Auth

One secret: a **Meta System User token**, in `META_SYSTEM_USER_TOKEN`. This is a
business-level token, **not** user OAuth and **not** the Page token.

1. Meta Business Settings → **Users → System Users** → add (or select) a System User.
2. Assign it the **ad account** (`act_…`) and the **Page** with full control.
3. **Generate token** → app = *galley-ads* → scopes **`ads_management`** + **`ads_read`**.
4. Put it in `META_SYSTEM_USER_TOKEN` (Vercel env + `.env.local`). Long-lived; rotate
   if it leaks. Everything spend-capable is created **PAUSED** — budget and resume
   are explicit, separate admin actions, so a leaked token can't silently spend.

### Asset IDs

The non-secret IDs (ad account, page, IG user, app, campaign, ad set, pixel) have
in-code defaults in `meta-config.ts` and are overridable via `META_*` env vars —
see `.env.example`. Override only when pointing at a different ad account/campaign.

### API surface

| Function | Does |
|---|---|
| `pushAdCreative({ imageUrl, headline, primaryText, linkUrl, name })` | Creates an ad creative + a **PAUSED** ad in the standing ad set. Returns `{ creativeId, adId }`. |
| `setDailyBudget(euros)` / `setWeeklyBudget(weeklyEuros)` | Sets campaign budget (Meta wants cents; weekly is pushed as weekly ÷ 7). |
| `pauseCampaign()` / `resumeCampaign()` | Flip campaign delivery. |
| `getInsights({ datePreset, breakdowns, campaignId })` | impressions/clicks/spend + `complete_registration` signups & cost-per-signup. Returns `[]` before any delivery. Feeds the GAL-393 dashboard. |

Errors throw `MetaAdsError`, preferring Meta's `error_user_msg`; routes surface the
message (never silent). Graph version is pinned at **v25.0** in `meta-ads.ts`.
