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
