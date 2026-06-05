/**
 * Meta ad creative text generation (GAL-390).
 *
 * From a published galley, produce ad copy variants ready for the Marketing API
 * push (GAL-391). Two narrative formats, 3 copy variants each:
 *   - "problem" — the chaotic-saves → clean-galley narrative
 *   - "hero"    — a single standout dish + galley CTA
 *
 * Routes through the AI Gateway like the rest of lib/marketing.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getTopLearnings } from "./learnings";

const COPY_MODEL = "google/gemini-3.5-flash";

export type AdFormat = "problem" | "hero";

// Permissive on length — models drift past char limits; we note the target in
// the prompt and let the admin trim. Meta soft-limits: headline ~40 chars,
// primary text ~125 before "... See more".
export const AdVariantSchema = z.object({
  format: z.enum(["problem", "hero"]),
  headline: z.string().describe("Punchy headline, aim for <40 chars"),
  primaryText: z.string().describe("Primary text, aim for <125 chars, 1 emoji max"),
});

export const AdVariantsSchema = z.object({
  variants: z.array(AdVariantSchema),
});

export type AdVariant = z.infer<typeof AdVariantSchema>;

// ---- Post title -----------------------------------------------------------

export const PostTitleSchema = z.object({
  title: z.string().describe("Catchy post headline, <55 chars"),
});

export interface GeneratePostTitleInput {
  theme: string;
  recipeNames: string[];
  locale?: "en" | "de";
}

/**
 * An appealing marketing headline for the post — replaces the internal galley
 * name (which carries the "— KW XX" suffix nobody cares about). Used on the
 * carousel cover + as the IG caption opener.
 */
export async function generatePostTitle({
  theme,
  recipeNames,
  locale = "de",
}: GeneratePostTitleInput): Promise<string> {
  const { object } = await generateObject({
    model: COPY_MODEL,
    schema: PostTitleSchema,
    system: [
      "You write scroll-stopping social post headlines for galleybook recipe collections.",
      "Make it concrete and appealing — lead with a number or a benefit when it fits",
      "(e.g. '5 high-protein dinners kids actually eat').",
      "Under 55 characters. No hashtags, no emoji, no quotes.",
      "NEVER mention calendar weeks, 'KW', dates, or 'Galley of the Week'.",
      `Output language: ${locale === "de" ? "German" : "English"}.`,
    ].join(" "),
    prompt: [
      `Theme: ${theme}`,
      recipeNames.length ? `Dishes: ${recipeNames.slice(0, 6).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });
  return object.title.trim();
}

export interface GenerateAdCopyInput {
  /** Galley theme / name, e.g. "Kids dish · healthy; high protein" */
  theme: string;
  /** A few recipe names from the galley for concrete hero references */
  recipeNames: string[];
  /** Output language. Defaults to "de" — softlaunch is Germany-first. */
  locale?: "en" | "de";
}

const VARIANTS_PER_FORMAT = 3;

export async function generateAdCopy({
  theme,
  recipeNames,
  locale = "de",
}: GenerateAdCopyInput): Promise<AdVariant[]> {
  // Bias new copy toward what's working (GAL-430 learning loop) — best-effort.
  const learnings = await getTopLearnings(6).catch(() => []);
  const learningsLine = learnings.length
    ? `Proven learnings to lean into (don't contradict them):\n${learnings
        .map((l) => `- ${l.statement} [${l.confidence}]`)
        .join("\n")}`
    : "";

  const { object } = await generateObject({
    model: COPY_MODEL,
    schema: AdVariantsSchema,
    system: [
      "You are a senior performance-marketing copywriter for galleybook,",
      "an app that imports any recipe from Instagram/YouTube/TikTok/web in seconds",
      "and keeps it in a private, organized recipe collection.",
      `Write ${VARIANTS_PER_FORMAT} variants for EACH of two formats (6 total):`,
      "- 'problem': open on the pain of recipes lost in scattered IG saves / screenshots,",
      "  resolve with the clean galleybook collection.",
      "- 'hero': lead with one specific mouth-watering dish, end on a save-to-your-galley CTA.",
      "Headlines are punchy (<40 chars). Primary text <125 chars, at most one emoji.",
      "No clickbait, no fake scarcity, no all-caps.",
      `Output language: ${locale === "de" ? "German" : "English"}.`,
    ].join(" "),
    prompt: [
      `Galley theme: ${theme}`,
      recipeNames.length ? `Example dishes: ${recipeNames.slice(0, 6).join(", ")}` : "",
      learningsLine,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  // Keep at most 3 per format so a chatty model can't unbalance the set.
  const byFormat: Record<AdFormat, AdVariant[]> = { problem: [], hero: [] };
  for (const v of object.variants) {
    if (byFormat[v.format].length < VARIANTS_PER_FORMAT) byFormat[v.format].push(v);
  }
  const result = [...byFormat.problem, ...byFormat.hero];

  logger.info("campaign_studio.ad_copy.generated", {
    theme,
    problem: byFormat.problem.length,
    hero: byFormat.hero.length,
  });
  return result;
}
