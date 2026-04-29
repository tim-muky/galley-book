import type { ImageSource, ParsedVia } from "@/lib/recipe-prompts";

export type { ImageSource, ParsedVia };

/**
 * Per-route diagnostics returned by `parseYouTube` (and progressively the
 * other parsers) so the GAL-139 test harness — and Vercel logs — can
 * distinguish "description was rejected by the heuristic" from "YouTube
 * blanked the page" from "transcript track absent". Optional everywhere; the
 * UI never reads these.
 */
export interface ParseDiagnostics {
  /** Length in characters of the watch-page description (or 0 when no description was retrieved). */
  descriptionLength?: number;
  /** Did `descriptionLooksLikeRecipe` accept the description? `null` when no description. */
  descriptionLooksLikeRecipe?: boolean | null;
  /** Length in characters of the joined transcript (or 0 when none). */
  transcriptLength?: number;
  /** Per-route latency in ms — useful for spotting which leg is slow. */
  latencyMs?: {
    description?: number;
    transcript?: number;
    thumbnails?: number;
    perplexity?: number;
    geminiVideo?: number;
  };
  /** Which route ultimately produced the content (mirrors `parsedVia` but cheap to scan in logs). */
  routeWinner?: ParsedVia;
}

export interface FetchResult {
  content: string;
  imageUrl: string | null;
  imageCandidates: string[];
  parsedVia: ParsedVia;
  imageSource: ImageSource;
  error?: string;
  diagnostics?: ParseDiagnostics;
}
