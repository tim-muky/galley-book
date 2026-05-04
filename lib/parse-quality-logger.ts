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
  sourceUrl: string;
  parsedVia: ParsedVia | null;
  success: boolean;
  /** Populated from detectMissingFields on successful parses. */
  missingFields?: string[];
  errorMessage?: string;
  recipeName?: string | null;
}

/** Fire-and-forget: logs only failures and partial parses (missing fields).
 *  Rows where success=true and missingFields is empty are not written — they're not interesting. */
export async function logParseQuality(params: ParseQualityParams): Promise<void> {
  const missing = params.missingFields ?? [];
  if (params.success && missing.length === 0) return;

  const supabase = createServiceClient();
  await supabase.from("parse_quality_logs").insert({
    user_id: params.userId,
    source_url: params.sourceUrl,
    platform: platformFromUrl(params.sourceUrl),
    parsed_via: params.parsedVia,
    success: params.success,
    missing_fields: missing,
    error_message: params.errorMessage ?? null,
    recipe_name: params.recipeName ?? null,
  });
}
