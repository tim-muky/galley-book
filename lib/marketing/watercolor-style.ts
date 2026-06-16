/**
 * Watercolor brand style anchor for AI-generated imagery.
 *
 * Used by Campaign Studio (Galley of the Week pipeline) and any other
 * generated marketing assets.
 *
 * Style direction (refreshed 2026-06-15, GAL-450): hyperrealistic watercolor +
 * colored-pencil painting of food — true-to-life natural colors, crisp photoreal
 * detail, soft diffused studio light with delicate specular highlights, a single
 * hero dish plated simply, shot top-down on a pure-white watercolor-paper
 * background. This replaces the earlier loose / muted-palette illustration look.
 *
 * The reference paintings live in `public/admin/style-anchors/`. NOTE: the
 * legacy anchor PNGs listed below are the OLD loose veggie illustrations and no
 * longer match this direction — replace them with the new reference images. The
 * generation step currently conditions on the text prompt only (anchors are not
 * passed to `generateImage`), so the prompt below is the active style lever.
 */

export type AspectRatio = "1:1" | "4:5" | "9:16" | "16:9";

export const ASPECT_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "4:5": { width: 1080, height: 1350 }, // IG carousel
  "9:16": { width: 1080, height: 1920 }, // Reel / TikTok / Story
  "16:9": { width: 1920, height: 1080 },
};

export const WATERCOLOR_STYLE_ANCHORS = [
  "/admin/style-anchors/asparagus.png",
  "/admin/style-anchors/beets.png",
  "/admin/style-anchors/carrots.png",
  "/admin/style-anchors/kale.png",
] as const;

/**
 * Positive style prompt — describes the look in language image models respond to.
 * Concrete nouns ("hand-painted edges", "muted palette") beat adjectives ("nice").
 */
export const WATERCOLOR_STYLE_PROMPT = [
  "hyperrealistic, highly detailed watercolor and colored-pencil painting of food",
  "lifelike photoreal rendering, true-to-life natural colors, crisp sharp detail and realistic textures",
  "soft diffused studio light, one gentle soft cast shadow on the white surface, delicate specular highlights",
  "viewed from directly overhead, top-down flat lay",
  "a single hero dish served on one simple plate and nothing else",
  "pure seamless white background, lots of empty white space, isolated subject",
  "fine subtle paper-grain texture, museum-quality realism",
].join(", ");

/**
 * Negative prompt — what to suppress. Image models that don't support
 * negative prompts ignore this; we still include it in the request when supported.
 */
export const WATERCOLOR_NEGATIVE_PROMPT = [
  "cartoon",
  "anime",
  "cel shading",
  "vector flat illustration",
  "loose abstract brushstrokes",
  "muted desaturated palette",
  "neon",
  "oversaturated",
  "harsh shadows",
  "dramatic lighting",
  "busy background",
  "clutter",
  "table setting props",
  "serving tray",
  "placemat",
  "table runner",
  "cutlery",
  "fork",
  "spoon",
  "knife",
  "second plate",
  "framed picture",
  "paper sheet with deckle edge",
  "drop-shadow border",
  "text overlay",
  "watermark",
  "signature",
  "border frame",
  "3D render",
  "CGI",
  "plastic look",
].join(", ");

/**
 * Default model for watercolor generation. Routed through the Vercel AI Gateway
 * so we can swap providers without touching call sites.
 *
 * gpt-image-2 best matches the hyperrealistic reference style (GAL-450) — true
 * photoreal detail on the plated dish. Imagen 4 Fast is the fallback: cheaper
 * and ~5s, but leans soft/illustrative. (The non-fast imagen-4.0-generate-001
 * is unprovisioned on the gateway and times out — do not use it.)
 *
 * Provider note: gpt-image takes `size` (not aspectRatio) and ignores the
 * Google-specific negative prompt — renderWatercolor sends the right params per
 * provider, so either model can be the default or fallback.
 */
export const WATERCOLOR_DEFAULT_MODEL = "openai/gpt-image-2";
export const WATERCOLOR_FALLBACK_MODEL = "google/imagen-4.0-fast-generate-001";

export interface BuildWatercolorPromptInput {
  /** Free-form subject — e.g. recipe name + one-liner, or campaign concept */
  subject: string;
  /** Optional extra direction (e.g. "with a small bowl of olive oil beside it") */
  composition?: string;
  /** Aspect ratio; affects which dimensions we request from the model */
  aspect?: AspectRatio;
}

export interface WatercolorPrompt {
  prompt: string;
  negativePrompt: string;
  /** The aspect ratio string Imagen expects (it rejects an explicit pixel `size`). */
  aspectRatio: AspectRatio;
  width: number;
  height: number;
  model: string;
  fallbackModel: string;
  styleAnchors: readonly string[];
}

/**
 * Build a fully-formed prompt for the image-generation layer.
 *
 * Convention: subject goes first (the model weighs early tokens heavier),
 * then composition direction, then style — so the watercolor look gets
 * applied to the right subject rather than a generic watercolor scene.
 */
export function buildWatercolorPrompt({
  subject,
  composition,
  aspect = "1:1",
}: BuildWatercolorPromptInput): WatercolorPrompt {
  const { width, height } = ASPECT_DIMENSIONS[aspect];

  const parts = [subject.trim()];
  if (composition?.trim()) parts.push(composition.trim());
  parts.push(WATERCOLOR_STYLE_PROMPT);

  return {
    prompt: parts.join(". "),
    negativePrompt: WATERCOLOR_NEGATIVE_PROMPT,
    aspectRatio: aspect,
    width,
    height,
    model: WATERCOLOR_DEFAULT_MODEL,
    fallbackModel: WATERCOLOR_FALLBACK_MODEL,
    styleAnchors: WATERCOLOR_STYLE_ANCHORS,
  };
}
