/**
 * Per-post hashtag generation for Campaign Studio captions (GAL-449).
 *
 * Replaces the old fixed niche/head lists (same tags on every post) with an AI
 * call that tailors the set to the actual content — the week's vegetable, the
 * galley theme, or the region — while keeping the proven guardrails from the
 * long-tail-first strategy (GAL-435):
 *
 *   - lead with specific / long-tail tags (a low-authority account can't
 *     surface on saturated head terms),
 *   - cap saturated head terms so they drop first,
 *   - always include #galleybook,
 *   - locale-correct (German hashtags on DE posts),
 *   - ≤12 total, deduped, alphanumeric only.
 *
 * If the AI call fails for any reason we fall back to the static lists, so a
 * caption is never left without hashtags.
 */

import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { logAIUsage } from "@/lib/ai-logger";

const HASHTAG_MODEL = "google/gemini-3.5-flash";
const MAX_HASHTAGS = 12;

export type ContentType = "veggie" | "galley" | "region";

export interface HashtagInput {
  /** The post theme — e.g. "Spargel — Gemüse der Woche" or "Best dishes from Sicily" */
  theme: string;
  /** Recipe names in the post, for topical specificity */
  recipeNames: string[];
  /** Drives the hint about what the post is about */
  contentType?: ContentType;
  locale: "de" | "en";
  userId?: string | null;
}

const HashtagSchema = z.object({
  hashtags: z
    .array(z.string())
    .describe("8-12 hashtags, words only, no leading # and no spaces"),
});

/** Static fallback — the GAL-435 long-tail-first lists, used if the AI call fails. */
export function fallbackHashtagWords({
  tags,
  locale,
}: {
  tags: string[];
  locale: "de" | "en";
}): string[] {
  const niche =
    locale === "de"
      ? ["mealprepdeutsch", "schnellerezepte", "familienrezepte", "wochenplan", "einfacherezepte"]
      : ["mealprepideas", "easyrecipes", "familymeals", "weeklymealplan", "quickrecipes"];
  const head = locale === "de" ? ["rezepte", "kochen", "mealprep"] : ["recipes", "cooking", "mealprep"];
  const galleyTags = tags.map((t) => sanitizeTag(t)).filter(Boolean);
  return dedupeCap(["galleybook", ...galleyTags.slice(0, 5), ...niche.slice(0, 3), ...head]);
}

/** Lowercase, strip everything but a–z/0–9 (hashtags can't contain punctuation/spaces). */
function sanitizeTag(t: string): string {
  return t.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** Dedupe (preserving order), drop empties, guarantee #galleybook leads, cap to 12. */
function dedupeCap(words: string[]): string[] {
  const cleaned = words.map(sanitizeTag).filter(Boolean);
  const unique = Array.from(new Set(["galleybook", ...cleaned]));
  return unique.slice(0, MAX_HASHTAGS);
}

/** Format bare words into a single "#a #b #c" string. */
export function formatHashtags(words: string[]): string {
  return words.map((w) => `#${w}`).join(" ");
}

/**
 * Generate a tailored hashtag set for one post. Returns bare words (no #),
 * already deduped/capped/sanitized with #galleybook first. Falls back to the
 * static lists on any failure.
 */
export async function generateHashtags(
  input: HashtagInput,
  fallbackTags: string[] = [],
): Promise<string[]> {
  const { theme, recipeNames, contentType = "galley", locale, userId = null } = input;
  const langName = locale === "de" ? "German" : "English";
  const startedAt = Date.now();
  const typeHint =
    contentType === "veggie"
      ? "a seasonal vegetable-of-the-week post"
      : contentType === "region"
        ? "a regional cuisine post (best dishes from a region)"
        : "a themed recipe collection (galley of the week)";

  try {
    const { object, usage } = await generateObject({
      model: HASHTAG_MODEL,
      schema: HashtagSchema,
      system: [
        "You write Instagram hashtags for galleybook, a recipe-saving app. DACH-first.",
        `This is ${typeHint}.`,
        `All hashtags must be in ${langName} (galleybook's audience for this post speaks ${langName}).`,
        "Strategy: a small, low-authority account cannot surface on saturated head tags, so LEAD with specific, long-tail, topical tags drawn from the dish/ingredient/region, then a few medium niche/occasion tags, and at most 2-3 broad head tags last.",
        "Tags must be real, commonly-used hashtags people actually search — not invented compound words.",
        "Lowercase, letters and digits only, no spaces, no punctuation, no leading #.",
        "Return 8-12 hashtags. Do NOT include 'galleybook' (it is added separately). No duplicates.",
      ].join(" "),
      prompt: `Theme: ${theme}\nRecipes in the post:\n${recipeNames.map((n) => `- ${n}`).join("\n")}`,
    });

    await logAIUsage({
      userId,
      operation: "campaign_hashtags",
      model: HASHTAG_MODEL,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      durationMs: Date.now() - startedAt,
      success: true,
    });
    const words = dedupeCap(object.hashtags);
    // If the model returned almost nothing usable, prefer the richer fallback.
    if (words.length < 5) {
      return fallbackHashtagWords({ tags: fallbackTags, locale });
    }
    return words;
  } catch (err) {
    await logAIUsage({
      userId,
      operation: "campaign_hashtags",
      model: HASHTAG_MODEL,
      inputTokens: null,
      outputTokens: null,
      durationMs: Date.now() - startedAt,
      success: false,
    });
    if (NoObjectGeneratedError.isInstance(err)) {
      logger.error("campaign_studio.hashtags.no_object", {
        cause: err.cause instanceof Error ? err.cause.message : String(err.cause),
      });
    } else {
      logger.error("campaign_studio.hashtags.failed", { message: String(err) });
    }
    return fallbackHashtagWords({ tags: fallbackTags, locale });
  }
}
