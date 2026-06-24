/**
 * Recipe content generation for the Galley of the Week pipeline.
 *
 * Three layers, called in order by the workflow:
 *   1. generateRecipeCandidates(brief) → 6 lightweight name + one-liner + tags
 *   2. generateRecipeImage(candidate)  → one watercolor image per survivor
 *   3. expandRecipe(candidate)         → full ingredients + steps for survivors
 *
 * All calls route through the Vercel AI Gateway so we can swap providers
 * without touching this file.
 */

import { generateObject, generateImage, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { logAIUsage, logAIImageUsage } from "@/lib/ai-logger";
import {
  buildWatercolorPrompt,
  type AspectRatio,
  type WatercolorPrompt,
} from "./watercolor-style";

const CANDIDATE_MODEL = "google/gemini-3.5-flash";
const EXPANSION_MODEL = "google/gemini-3.5-flash";
const CANDIDATE_COUNT = 6;

// ---- Schemas ---------------------------------------------------------------

// Schemas are intentionally permissive — models drift on edge constraints
// (exact array lengths, tight min/max), so we validate shape, not bounds,
// and trim to spec in post.
export const RecipeCandidateSchema = z.object({
  name: z.string().describe("The dish name, evocative but precise"),
  oneLiner: z
    .string()
    .describe("Single-sentence appetite hook, 1-2 standout ingredients"),
  tags: z
    .array(z.string())
    .describe("2-5 lowercase tags: cuisine, technique, occasion, dietary"),
  course: z
    .string()
    .optional()
    .describe(
      "Course label, lowercase English: starter | main | dessert | side | breakfast | snack | drink. Required if the brief specifies a course split.",
    ),
});

export const RecipeCandidatesSchema = z.object({
  candidates: z.array(RecipeCandidateSchema),
});

export const FullRecipeSchema = z.object({
  ingredients: z.array(
    z.object({
      amount: z.string().describe("e.g. '200 g', '2 EL', '1 Prise'"),
      name: z.string(),
    }),
  ),
  steps: z.array(z.string()),
  cookTimeMinutes: z.number(),
  servings: z.number(),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

export type RecipeCandidate = z.infer<typeof RecipeCandidateSchema>;
export type FullRecipe = z.infer<typeof FullRecipeSchema>;

// ---- Inputs ----------------------------------------------------------------

export interface GalleyBrief {
  /** Free-form theme — the one thing the galley is about */
  theme?: string;
  /** Optional extra direction */
  notes?: string;
  /** Output locale for names + one-liners. Defaults to "de" (DACH-first). */
  locale?: "en" | "de";

  // Legacy fields — older runs persisted these. Still respected if present,
  // but new runs use `theme` only.
  country?: string;
  style?: string;
  dishType?: string;
  ingredientSeeds?: string[];
}

// ---- Helpers ---------------------------------------------------------------

function buildBriefPrompt(brief: GalleyBrief): string {
  const lines: string[] = [];
  if (brief.theme) lines.push(`Theme: ${brief.theme}`);
  if (brief.country) lines.push(`Country / cuisine focus: ${brief.country}`);
  if (brief.style) lines.push(`Style: ${brief.style}`);
  if (brief.dishType) lines.push(`Dish type: ${brief.dishType}`);
  if (brief.ingredientSeeds?.length)
    lines.push(`Hero ingredients to favor: ${brief.ingredientSeeds.join(", ")}`);
  if (brief.notes) lines.push(`Notes: ${brief.notes}`);
  return lines.length ? lines.join("\n") : "No specific brief — surprise me with a coherent theme.";
}

// ---- 1) Candidates ---------------------------------------------------------

export async function generateRecipeCandidates(
  brief: GalleyBrief,
  options: { userId?: string | null } = {},
): Promise<RecipeCandidate[]> {
  const locale = brief.locale ?? "de";
  const userId = options.userId ?? null;
  const startedAt = Date.now();

  try {
    const { object, usage } = await generateObject({
      model: CANDIDATE_MODEL,
      schema: RecipeCandidatesSchema,
      system: [
        "You are a cookbook editor curating a themed 'Galley of the Week' for galleybook.",
        `Generate exactly ${CANDIDATE_COUNT} recipe ideas that hang together as one coherent collection.`,
        "Names must be specific and evocative — never generic like 'Pasta with sauce'.",
        "Avoid near-duplicates within the set (no two pasta dishes unless the brief is pasta-only).",
        "If the brief specifies an exact course split (e.g. '2 starters, 3 mains, 1 dessert'), follow it precisely and set `course` on every candidate to one of: starter | main | dessert | side | breakfast | snack | drink. Otherwise mix complexity ~2 quick weeknight / ~3 main centerpiece / ~1 ambitious showpiece and `course` is optional.",
        `Output language for name + one-liner: ${locale === "de" ? "German" : "English"}.`,
        "Tags are always lowercase English regardless of locale.",
      ].join(" "),
      prompt: `Brief:\n${buildBriefPrompt(brief)}`,
    });

    await logAIUsage({
      userId,
      operation: "campaign_candidates",
      model: CANDIDATE_MODEL,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      durationMs: Date.now() - startedAt,
      success: true,
    });
    // Trim to spec — models drift by ±1 on exact counts. We accept ≥4 as success.
    const candidates = object.candidates.slice(0, CANDIDATE_COUNT);
    if (candidates.length < 4) {
      throw new Error(`Model returned only ${candidates.length} candidates`);
    }
    return candidates;
  } catch (err) {
    await logAIUsage({
      userId,
      operation: "campaign_candidates",
      model: CANDIDATE_MODEL,
      inputTokens: null,
      outputTokens: null,
      durationMs: Date.now() - startedAt,
      success: false,
    });
    if (NoObjectGeneratedError.isInstance(err)) {
      logger.error("campaign_studio.candidates.no_object", {
        cause: err.cause instanceof Error ? err.cause.message : String(err.cause),
        rawText: err.text?.slice(0, 2000),
        finishReason: err.finishReason,
      });
    }
    throw err;
  }
}

// ---- 2) Image --------------------------------------------------------------

export interface GeneratedImage {
  /** Base64-encoded PNG/JPEG (no data: prefix) */
  base64: string;
  /** Media type, e.g. "image/png" */
  mediaType: string;
  /** Prompt that produced it — store with the recipe for re-roll context */
  prompt: string;
}

/** gpt-image-2 supports a small fixed set of sizes — map our aspect onto the nearest. */
function openaiSize(aspect: AspectRatio): `${number}x${number}` {
  switch (aspect) {
    case "16:9":
      return "1536x1024";
    case "9:16":
    case "4:5":
      return "1024x1536";
    default:
      return "1024x1024";
  }
}

/**
 * Build the generateImage params for a given model. The two providers take
 * different shapes: OpenAI (gpt-image) uses `size` and ignores Google's negative
 * prompt — so we fold the key "don't" constraints into the prompt — while Imagen
 * rejects an explicit pixel `size` and reads the negative prompt + aspect only
 * from providerOptions.google.
 */
function imageParams(model: string, built: WatercolorPrompt): Parameters<typeof generateImage>[0] {
  if (model.startsWith("openai/")) {
    // Pin quality to "medium" so per-image cost is predictable rather than
    // relying on the provider default (which trends to high/auto). Medium keeps
    // the photoreal look at a fraction of high-tier cost.
    return {
      model,
      prompt: `${built.prompt}. No text, lettering, watermarks, or extra props.`,
      size: openaiSize(built.aspectRatio),
      providerOptions: { openai: { quality: "medium" } },
    };
  }
  return {
    model,
    prompt: built.prompt,
    size: `${built.width}x${built.height}` as `${number}x${number}`,
    providerOptions: {
      google: { aspectRatio: built.aspectRatio, negativePrompt: built.negativePrompt },
    },
  };
}

async function renderWatercolor(
  built: WatercolorPrompt,
): Promise<GeneratedImage & { modelUsed: string }> {
  try {
    const { image } = await generateImage(imageParams(built.model, built));
    return { base64: image.base64, mediaType: image.mediaType, prompt: built.prompt, modelUsed: built.model };
  } catch (primaryError) {
    // One retry on the fallback model (different provider) — image gen
    // rate-limits are common, and each model rejects some prompts the other
    // accepts. imageParams sends the right param shape for whichever model.
    if (built.fallbackModel && built.fallbackModel !== built.model) {
      const { image } = await generateImage(imageParams(built.fallbackModel, built));
      return { base64: image.base64, mediaType: image.mediaType, prompt: built.prompt, modelUsed: built.fallbackModel };
    }
    throw primaryError;
  }
}

async function renderAndLog(
  built: WatercolorPrompt,
  operation: "campaign_recipe_image" | "campaign_galley_cover",
  userId: string | null,
): Promise<GeneratedImage> {
  const startedAt = Date.now();
  try {
    const result = await renderWatercolor(built);
    await logAIImageUsage({
      userId,
      operation,
      model: result.modelUsed,
      imageCount: 1,
      durationMs: Date.now() - startedAt,
      success: true,
    });
    return { base64: result.base64, mediaType: result.mediaType, prompt: result.prompt };
  } catch (err) {
    await logAIImageUsage({
      userId,
      operation,
      model: built.model,
      imageCount: 0,
      durationMs: Date.now() - startedAt,
      success: false,
    });
    throw err;
  }
}

export async function generateRecipeImage(
  candidate: Pick<RecipeCandidate, "name" | "oneLiner">,
  options: { aspect?: AspectRatio; userId?: string | null } = {},
): Promise<GeneratedImage> {
  const built = buildWatercolorPrompt({
    subject: `${candidate.name} — ${candidate.oneLiner}`,
    composition: "single dish centered, top-down or three-quarter view, props minimal",
    aspect: options.aspect ?? "1:1",
  });
  return renderAndLog(built, "campaign_recipe_image", options.userId ?? null);
}

/**
 * One wide watercolor cover for a galley, themed on the collection name.
 * Rendered at 16:9 — the publish step crops it to the 1200×400 header banner.
 */
export async function generateGalleyCoverImage(
  theme: string,
  options: { aspect?: AspectRatio; userId?: string | null } = {},
): Promise<GeneratedImage> {
  const built = buildWatercolorPrompt({
    subject: `Cookbook cover artwork for a recipe collection titled "${theme}"`,
    composition:
      "a loose still-life of the collection's hero ingredients spread across a wide horizontal banner, generous negative space, no text or lettering",
    aspect: options.aspect ?? "16:9",
  });
  return renderAndLog(built, "campaign_galley_cover", options.userId ?? null);
}

// ---- 3) Full expansion -----------------------------------------------------

export async function expandRecipe(
  candidate: Pick<RecipeCandidate, "name" | "oneLiner">,
  options: { locale?: "en" | "de"; userId?: string | null } = {},
): Promise<FullRecipe> {
  const locale = options.locale ?? "de";
  const userId = options.userId ?? null;
  const startedAt = Date.now();

  const { object, usage } = await generateObject({
    model: EXPANSION_MODEL,
    schema: FullRecipeSchema,
    system: [
      "You are a recipe developer writing tested, executable home-cook recipes.",
      "Ingredient amounts must be specific and realistic — no 'salt to taste' as the only seasoning, no '500 g salt'.",
      "Steps must be concrete and actionable. Never 'cook until done' — specify time, temperature, and visual cue.",
      "Servings default to 4 unless the dish type implies otherwise.",
      `Output language: ${locale === "de" ? "German" : "English"}.`,
      `Ingredient amounts use ${locale === "de" ? "metric with German units (g, ml, EL, TL, Prise)" : "metric (g, ml, tbsp, tsp, pinch)"}.`,
    ].join(" "),
    prompt: `Write the full recipe for:\n\nName: ${candidate.name}\nConcept: ${candidate.oneLiner}`,
  });

  await logAIUsage({
    userId,
    operation: "campaign_expansion",
    model: EXPANSION_MODEL,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    durationMs: Date.now() - startedAt,
    success: true,
  });
  return object;
}
