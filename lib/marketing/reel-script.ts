/**
 * Reel / TikTok short-form video script generation (GAL-434, Phase A).
 *
 * From a published galley, produce a few ready-to-film vertical-video scripts:
 * hook + shot list + on-screen text + caption. No video is rendered here — these
 * are copy-paste scripts the founder films and uploads (TikTok/Reels in v1 are
 * manual upload per the milestone scope).
 *
 * Mirrors ad-copy.ts: same AI Gateway model, same angle taxonomy as the paid
 * learning loop, plus the organic-native "comment" angle (comment → DM mechanic).
 */

import { generateObject } from "ai";
import { z } from "zod";
import { logger } from "@/lib/logger";

const SCRIPT_MODEL = "google/gemini-3.5-flash";

// Same taxonomy as creative-tagging.ts, extended with the organic "comment"
// angle whose CTA is the comment→DM mechanic (the proven organic install driver).
export type ReelAngle = "problem" | "hero" | "comment";

const ShotSchema = z.object({
  visual: z.string().describe("What's on camera in this shot — concrete and filmable"),
  onScreen: z.string().describe("On-screen text overlay for this shot. Short. May be empty."),
  voiceover: z.string().describe("Spoken/voiceover line for this shot. Speakable in a few seconds."),
});

export const ReelScriptSchema = z.object({
  title: z.string().describe("Short internal working title for the script"),
  angle: z.enum(["problem", "hero", "comment"]),
  hook: z.string().describe("The first 1-2s line, said AND on screen — the scroll-stopper"),
  shots: z.array(ShotSchema).min(2).max(6),
  caption: z.string().describe("The post caption including the CTA. Ends with a few hashtags."),
  trigger: z
    .string()
    .nullable()
    .describe("For the 'comment' angle: the ONE-word CAPS comment trigger (e.g. REZEPT). Else null."),
  cta: z.enum(["import", "save-to-galley", "comment-dm"]),
});

export const ReelScriptsSchema = z.object({
  scripts: z.array(ReelScriptSchema),
});

export type ReelScript = z.infer<typeof ReelScriptSchema>;

export interface GenerateReelScriptsInput {
  /** Galley theme / name for context. */
  theme: string;
  /** A few recipe names from the galley for concrete hero references. */
  recipeNames: string[];
  /** Output language. Defaults to "de" — softlaunch is Germany-first. */
  locale?: "en" | "de";
  /** How many scripts to generate (default 3, one per angle). */
  count?: number;
}

export async function generateReelScripts({
  theme,
  recipeNames,
  locale = "de",
  count = 3,
}: GenerateReelScriptsInput): Promise<ReelScript[]> {
  const { object } = await generateObject({
    model: SCRIPT_MODEL,
    schema: ReelScriptsSchema,
    system: [
      "You write short-form vertical-video scripts (Instagram Reels / TikTok, 15-30s) for galleybook,",
      "an app that imports any recipe from Instagram/YouTube/TikTok/web in seconds and keeps it in one",
      "organized, cross-platform collection for €1.99/month.",
      `Write ${count} distinct scripts, ideally one per angle:`,
      "- 'problem': open on the pain of recipes lost in scattered screenshots/IG saves → galleybook fixes it (cta: import).",
      "- 'hero': lead with one mouth-watering dish from the galley → save it to your galley (cta: save-to-galley).",
      "- 'comment': a curiosity hook that tells viewers to comment a ONE-word CAPS trigger to get the recipe DMed (cta: comment-dm; set `trigger`).",
      "The FIRST shot is the hook — no slow intros, no logo opens. Show the product truth (importing a recipe in seconds).",
      "Keep voiceover lines speakable in the shot's duration. On-screen text is short.",
      "Captions end with a few niche, long-tail hashtags (not just #rezepte) plus #galleybook.",
      'Always lowercase "galleybook". No clickbait, no all-caps except a comment trigger word.',
      `Output language: ${locale === "de" ? "German (native, idiomatic — not translated)" : "English"}.`,
    ].join(" "),
    prompt: [
      `Galley theme: ${theme}`,
      recipeNames.length ? `Dishes in the galley: ${recipeNames.slice(0, 6).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const scripts = object.scripts.slice(0, count);
  logger.info("campaign_studio.reel_scripts.generated", {
    theme,
    count: scripts.length,
    angles: scripts.map((s) => s.angle),
  });
  return scripts;
}
