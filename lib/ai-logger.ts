import { createServiceClient } from "@/lib/supabase/service";

export type AIOperation =
  | "parse_link"
  | `parse_link:${string}`
  | "parse_image"
  | "parse_text"
  | "recommendation"
  | "translate"
  | "campaign_candidates"
  | "campaign_expansion"
  | "campaign_recipe_image"
  | "campaign_galley_cover"
  | "campaign_ad_copy"
  | "campaign_post_title"
  | "campaign_hashtags"
  | "campaign_reel_scripts"
  | "campaign_proofread"
  | "campaign_growth_analysis";

interface AIUsageParams {
  userId: string | null;
  operation: AIOperation;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  success: boolean;
}

interface AIImageUsageParams {
  userId: string | null;
  operation: AIOperation;
  model: string;
  imageCount: number;
  durationMs: number;
  success: boolean;
}

// USD per token. Gateway-prefixed entries match the model strings used by lib/marketing
// (which route through the Vercel AI Gateway).
const PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.30 / 1_000_000, output: 2.50 / 1_000_000 },
  "perplexity-sonar": { input: 1.0 / 1_000_000, output: 1.0 / 1_000_000 },
  "google/gemini-3.5-flash": { input: 0.30 / 1_000_000, output: 2.50 / 1_000_000 },
};

// USD per generated image. Rough public list-price estimates — update if billing diverges.
const IMAGE_PRICING: Record<string, number> = {
  "openai/gpt-image-2": 0.04,
  "openai/dalle-3": 0.04,
  "google/imagen-4": 0.04,
};

export async function logAIUsage(params: AIUsageParams): Promise<void> {
  const pricing = PRICING[params.model];
  const costUsd =
    pricing && params.inputTokens != null && params.outputTokens != null
      ? pricing.input * params.inputTokens + pricing.output * params.outputTokens
      : null;

  const supabase = createServiceClient();
  await supabase.from("ai_usage_logs").insert({
    user_id: params.userId,
    operation: params.operation,
    model: params.model,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    cost_usd: costUsd,
    duration_ms: params.durationMs,
    success: params.success,
  });
}

// Image generation is unit-priced, not token-priced. We store image count in
// output_tokens so the dashboard's existing tokens column shows something useful.
export async function logAIImageUsage(params: AIImageUsageParams): Promise<void> {
  const perImage = IMAGE_PRICING[params.model];
  const costUsd = perImage != null ? perImage * params.imageCount : null;

  const supabase = createServiceClient();
  await supabase.from("ai_usage_logs").insert({
    user_id: params.userId,
    operation: params.operation,
    model: params.model,
    input_tokens: 0,
    output_tokens: params.imageCount,
    cost_usd: costUsd,
    duration_ms: params.durationMs,
    success: params.success,
  });
}
