/**
 * Pre-publish proofread for Campaign Studio posts (GAL-457).
 *
 * A multimodal review of the *rendered* carousel slides + the caption, run
 * before the admin posts to any channel. Vision matters: text-rendering glitches
 * (e.g. "Pur ee" for "Purée", clipped or overlapping text) only exist in the
 * rendered image, so a text-only check can't see them.
 *
 * Advisory — returns a list of issues; the UI warns but doesn't hard-block.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { logger } from "@/lib/logger";

const PROOFREAD_MODEL = "google/gemini-3.5-flash";

export const ProofreadSchema = z.object({
  issues: z.array(
    z.object({
      severity: z.enum(["error", "warning"]),
      area: z
        .string()
        .describe("Where: 'slide-text' | 'spelling' | 'language' | 'dish-name' | 'caption' | 'other'"),
      slide: z.number().nullable().describe("1-based slide number, or null for the caption"),
      detail: z.string().describe("What's wrong; quote the offending text"),
    }),
  ),
});

export type ProofreadIssue = z.infer<typeof ProofreadSchema>["issues"][number];

export interface ProofreadResult {
  ok: boolean;
  issues: ProofreadIssue[];
}

export interface ProofreadInput {
  /** Public JPEG URLs of the carousel slides, in order. */
  slideUrls: string[];
  /** The caption that will be posted (already includes hashtags). */
  caption: string;
  /** Expected post language. */
  locale: "de" | "en";
}

async function fetchImage(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Proofread the rendered slides + caption. Returns issues with severity;
 * `ok` is true when there are no `error`-level issues. On any failure returns
 * ok:true with no issues (never blocks publishing on the checker itself).
 */
export async function proofreadDistribution({
  slideUrls,
  caption,
  locale,
}: ProofreadInput): Promise<ProofreadResult> {
  const langName = locale === "de" ? "German" : "English";
  const images = await Promise.all(slideUrls.slice(0, 10).map(fetchImage));

  const content: Array<
    { type: "text"; text: string } | { type: "image"; image: Uint8Array }
  > = [
    {
      type: "text",
      text: [
        "You are a meticulous proofreader for galleybook's Instagram/Facebook/TikTok posts.",
        `The post should be in ${langName}.`,
        "You are shown the rendered carousel slides (in order) and the caption below.",
        "Flag problems:",
        "1. Garbled / broken / clipped TEXT rendered ON a slide — split words, dropped letters or accents (e.g. 'Pur ee' instead of 'Purée'), overlapping or cut-off text.",
        "2. Spelling / typos.",
        `3. Wrong or mixed language (should be ${langName}).`,
        "4. Implausible or clearly wrong dish names.",
        "5. Caption issues — broken hashtags, duplicated text, wrong language.",
        "Cite the 1-based slide number (null for the caption) and quote the offending text. Use severity 'error' for garbled/broken/wrong-language; 'warning' for minor polish. If everything is correct, return an empty issues array.",
        "",
        `CAPTION:\n${caption}`,
      ].join("\n"),
    },
  ];
  images.forEach((img, i) => {
    if (!img) return;
    content.push({ type: "text", text: `Slide ${i + 1}:` });
    content.push({ type: "image", image: img });
  });

  try {
    const { object } = await generateObject({
      model: PROOFREAD_MODEL,
      schema: ProofreadSchema,
      messages: [{ role: "user", content }],
    });
    const issues = object.issues ?? [];
    return { ok: !issues.some((i) => i.severity === "error"), issues };
  } catch (err) {
    logger.error("campaign_studio.proofread.failed", { message: String(err) });
    return { ok: true, issues: [] };
  }
}
