import { createServiceClient } from "@/lib/supabase/service";

export type AIOperation =
  | "parse_link"
  | `parse_link:${string}`
  | "parse_image"
  | "recommendation"
  | "translate";

interface AIUsageParams {
  userId: string | null;
  operation: AIOperation;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  success: boolean;
}

// USD per token
const PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.075 / 1_000_000, output: 0.30 / 1_000_000 },
  "perplexity-sonar": { input: 1.0 / 1_000_000, output: 1.0 / 1_000_000 },
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
