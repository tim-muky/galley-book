/**
 * POST /api/recipes/parse-text
 *
 * Accepts raw recipe text the user pasted (from a website, a message, a note)
 * and uses Gemini to extract structured recipe data. Same contract as
 * /api/recipes/parse, minus the URL fetch, SSRF check, and image handling —
 * there is no source page, just text. Returns the same parsed shape.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAIUsage } from "@/lib/ai-logger";
import { checkParseLimit } from "@/lib/rate-limit";
import { buildRecipePrompt, normalizeRecipeTags } from "@/lib/recipe-prompts";
import { logParseQuality, detectMissingFields } from "@/lib/parse-quality-logger";
import { getGalleyPlan, freeImportAllowed } from "@/lib/subscription";
import { resolveActiveGalleyId } from "@/lib/active-galley";
import { z } from "zod";

const ParseTextSchema = z.object({
  text: z.string().min(1).max(20000),
});

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export async function POST(request: Request) {
  if (!process.env.GOOGLE_AI_API_KEY) {
    return NextResponse.json({ error: "Recipe parsing is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const galleyId = await resolveActiveGalleyId(supabase, user.id);
  if (galleyId) {
    const plan = await getGalleyPlan(supabase, galleyId, user.id, user.created_at);
    if (plan !== "premium" && !(await freeImportAllowed(user.id))) {
      return NextResponse.json(
        { error: "AI recipe import is a premium feature.", upgrade: true },
        { status: 403 },
      );
    }
  }

  const rl = await checkParseLimit(user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const body = await request.json();
  const parsedBody = ParseTextSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Recipe text is required" }, { status: 400 });
  }
  const text = parsedBody.data.text.trim();
  if (!text) {
    return NextResponse.json({ error: "Recipe text is required" }, { status: 400 });
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { thinkingConfig: { thinkingBudget: 0 } } as never,
  });

  const promptText = buildRecipePrompt("pasted_text", text, null, false);

  const t0 = Date.now();
  const result = await model.generateContent([{ text: promptText }]);
  const duration = Date.now() - t0;

  const usage = result.response.usageMetadata;
  const outputTokens =
    (usage?.candidatesTokenCount ?? 0) +
      ((usage as { thoughtsTokenCount?: number } | undefined)?.thoughtsTokenCount ?? 0) || null;

  const rawText = result.response.text();

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const parsed = JSON.parse(jsonMatch[0]);

    // A paste with no extractable recipe (the user pasted the wrong thing, or
    // only a title) leaves a blank form — surface it as an explicit failure.
    const ingredientsEmpty =
      !Array.isArray(parsed.ingredients) || parsed.ingredients.length === 0;
    const stepsEmpty = !Array.isArray(parsed.steps) || parsed.steps.length === 0;
    if (!parsed.name || (ingredientsEmpty && stepsEmpty)) {
      void logParseQuality({ userId: user.id, sourceUrl: null, parsedVia: "pasted_text", success: false, errorMessage: "text_no_recipe_content" });
      await logAIUsage({
        userId: user.id,
        operation: "parse_text",
        model: "gemini-2.5-flash",
        inputTokens: usage?.promptTokenCount ?? null,
        outputTokens,
        durationMs: duration,
        success: false,
      });
      return NextResponse.json(
        { error: "Could not find a recipe in that text. Check that you pasted the full recipe, or add it manually." },
        { status: 422 }
      );
    }

    parsed.parsed_via = "pasted_text";
    normalizeRecipeTags(parsed);
    void logParseQuality({
      userId: user.id,
      sourceUrl: null,
      parsedVia: "pasted_text",
      success: true,
      missingFields: detectMissingFields(parsed),
      recipeName: typeof parsed.name === "string" ? parsed.name : null,
    });
    await logAIUsage({
      userId: user.id,
      operation: "parse_text",
      model: "gemini-2.5-flash",
      inputTokens: usage?.promptTokenCount ?? null,
      outputTokens,
      durationMs: duration,
      success: true,
    });
    return NextResponse.json(parsed);
  } catch {
    void logParseQuality({ userId: user.id, sourceUrl: null, parsedVia: "pasted_text", success: false, errorMessage: "json_parse_failed" });
    await logAIUsage({
      userId: user.id,
      operation: "parse_text",
      model: "gemini-2.5-flash",
      inputTokens: usage?.promptTokenCount ?? null,
      outputTokens,
      durationMs: duration,
      success: false,
    });
    return NextResponse.json(
      { error: "Could not parse a recipe from that text. Try adding it manually." },
      { status: 422 }
    );
  }
}
