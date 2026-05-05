import { createServiceClient } from "@/lib/supabase/service";
import type { ParsedVia } from "@/lib/recipe-prompts";

export type ParsePlatform = "instagram" | "youtube" | "tiktok" | "website";

export function platformFromUrl(url: string): ParsePlatform {
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/tiktok\.com/i.test(url)) return "tiktok";
  return "website";
}

/** Inspect a successfully-parsed recipe object and return which fields are empty. */
export function detectMissingFields(parsed: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (!parsed.season) missing.push("season");
  if (!parsed.type) missing.push("type");
  if (!parsed.image_url) missing.push("image");
  if (!Array.isArray(parsed.ingredients) || (parsed.ingredients as unknown[]).length === 0)
    missing.push("ingredients");
  if (!Array.isArray(parsed.steps) || (parsed.steps as unknown[]).length === 0)
    missing.push("steps");
  return missing;
}

interface ParseQualityParams {
  userId: string | null;
  sourceUrl: string | null;
  parsedVia: ParsedVia | null;
  success: boolean;
  /** Populated from detectMissingFields on successful parses. */
  missingFields?: string[];
  errorMessage?: string;
  recipeName?: string | null;
  /** True when the user reviewed the AI-parsed draft and chose to discard it. */
  discarded?: boolean;
}

/** Fire-and-forget: logs failures, partial parses (missing fields), and user-discarded drafts.
 *  Rows where success=true, missingFields is empty, and discarded=false are not written — they're not interesting. */
export async function logParseQuality(params: ParseQualityParams): Promise<void> {
  const missing = params.missingFields ?? [];
  const discarded = params.discarded ?? false;
  if (params.success && missing.length === 0 && !discarded) return;

  const supabase = createServiceClient();
  await supabase.from("parse_quality_logs").insert({
    user_id: params.userId,
    source_url: params.sourceUrl,
    platform: params.sourceUrl ? platformFromUrl(params.sourceUrl) : "website",
    parsed_via: params.parsedVia,
    success: params.success,
    missing_fields: missing,
    error_message: params.errorMessage ?? null,
    recipe_name: params.recipeName ?? null,
    discarded,
  });
}
