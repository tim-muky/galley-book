/**
 * Watercolor brand style anchor for AI-generated imagery.
 *
 * Used by Campaign Studio (Galley of the Week pipeline) and any other
 * generated marketing assets. The look matches existing app assets —
 * see `public/onboarding/*.png` for the canonical veggie illustrations.
 *
 * Anchor images for image-to-image conditioning live at
 * `public/admin/style-anchors/`.
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
  "soft watercolor illustration",
  "hand-painted with visible brushstrokes and gentle bleed edges",
  "warm muted palette: ochre, sage, terracotta, dusty rose, parchment",
  "white or off-white background, isolated subject, no scene clutter",
  "loose organic linework, slight irregularity, paper grain visible",
  "editorial cookbook aesthetic, food-as-still-life",
  "no photorealism, no 3D render, no cartoon, no glossy digital painting",
].join(", ");

/**
 * Negative prompt — what to suppress. Image models that don't support
 * negative prompts ignore this; we still include it in the request when supported.
 */
export const WATERCOLOR_NEGATIVE_PROMPT = [
  "photograph",
  "photorealistic",
  "3D render",
  "CGI",
  "cartoon",
  "anime",
  "vector flat illustration",
  "neon",
  "high saturation",
  "harsh shadows",
  "busy background",
  "text overlay",
  "watermark",
  "signature",
].join(", ");

/**
 * Default model for watercolor generation. Routed through the Vercel AI Gateway
 * so we can swap providers without touching call sites.
 *
 * Imagen 3 produces the cleanest watercolor textures in our testing;
 * gpt-image-1 is the fallback if Imagen quota is exhausted.
 */
export const WATERCOLOR_DEFAULT_MODEL = "google/imagen-4.0-generate-001";
export const WATERCOLOR_FALLBACK_MODEL = "openai/gpt-image-2";

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
    width,
    height,
    model: WATERCOLOR_DEFAULT_MODEL,
    fallbackModel: WATERCOLOR_FALLBACK_MODEL,
    styleAnchors: WATERCOLOR_STYLE_ANCHORS,
  };
}
