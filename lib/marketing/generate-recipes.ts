/**
 * Recipe content generation for the Galley of the Week pipeline.
 *
 * Three layers, called in order by the workflow:
 *   1. generateRecipeCandidates(brief) → 10 lightweight name + one-liner + tags
 *   2. generateRecipeImage(candidate)  → one watercolor image per survivor
 *   3. expandRecipe(candidate)         → full ingredients + steps for survivors
 *
 * All calls route through the Vercel AI Gateway so we can swap providers
 * without touching this file.
 */

import { generateObject, generateImage, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  buildWatercolorPrompt,
  WATERCOLOR_DEFAULT_MODEL,
  WATERCOLOR_FALLBACK_MODEL,
  type AspectRatio,
} from "./watercolor-style";

const CANDIDATE_MODEL = "google/gemini-3.5-flash";
const EXPANSION_MODEL = "google/gemini-3.5-flash";
const CANDIDATE_COUNT = 10;

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
  /** Output locale for names + one-liners. Defaults to "en" */
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

export async function generateRecipeCandidates(brief: GalleyBrief): Promise<RecipeCandidate[]> {
  const locale = brief.locale ?? "en";

  try {
    const { object } = await generateObject({
      model: CANDIDATE_MODEL,
      schema: RecipeCandidatesSchema,
      system: [
        "You are a cookbook editor curating a themed 'Galley of the Week' for galleybook.",
        `Generate exactly ${CANDIDATE_COUNT} recipe ideas that hang together as one coherent collection.`,
        "Names must be specific and evocative — never generic like 'Pasta with sauce'.",
        "Avoid near-duplicates within the set (no two pasta dishes unless the brief is pasta-only).",
        "Mix complexity: ~3 quick weeknight, ~5 main centerpiece, ~2 ambitious or showpiece.",
        `Output language for name + one-liner: ${locale === "de" ? "German" : "English"}.`,
        "Tags are always lowercase English regardless of locale.",
      ].join(" "),
      prompt: `Brief:\n${buildBriefPrompt(brief)}`,
    });

    // Trim to spec — models often return 9 or 11. We accept ≥6 as success.
    const candidates = object.candidates.slice(0, CANDIDATE_COUNT);
    if (candidates.length < 6) {
      throw new Error(`Model returned only ${candidates.length} candidates`);
    }
    return candidates;
  } catch (err) {
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

export async function generateRecipeImage(
  candidate: Pick<RecipeCandidate, "name" | "oneLiner">,
  options: { aspect?: AspectRatio } = {},
): Promise<GeneratedImage> {
  const built = buildWatercolorPrompt({
    subject: `${candidate.name} — ${candidate.oneLiner}`,
    composition: "single dish centered, top-down or three-quarter view, props minimal",
    aspect: options.aspect ?? "1:1",
  });

  try {
    const { image } = await generateImage({
      model: built.model,
      prompt: built.prompt,
      size: `${built.width}x${built.height}` as const,
    });
    return { base64: image.base64, mediaType: image.mediaType, prompt: built.prompt };
  } catch (primaryError) {
    // One retry on the fallback model. Image gen rate-limits are common
    // and Imagen specifically rejects some prompts the OpenAI model accepts.
    if (built.model === WATERCOLOR_DEFAULT_MODEL) {
      const { image } = await generateImage({
        model: WATERCOLOR_FALLBACK_MODEL,
        prompt: built.prompt,
        size: `${built.width}x${built.height}` as const,
      });
      return { base64: image.base64, mediaType: image.mediaType, prompt: built.prompt };
    }
    throw primaryError;
  }
}

// ---- 3) Full expansion -----------------------------------------------------

export async function expandRecipe(
  candidate: Pick<RecipeCandidate, "name" | "oneLiner">,
  options: { locale?: "en" | "de" } = {},
): Promise<FullRecipe> {
  const locale = options.locale ?? "en";

  const { object } = await generateObject({
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

  return object;
}
