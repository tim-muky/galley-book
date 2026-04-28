import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkTranslateLimit } from "@/lib/rate-limit";
import { logAIUsage } from "@/lib/ai-logger";

export const maxDuration = 30;

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

const LANGUAGE_NAMES: Record<string, string> = {
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  ja: "Japanese",
  zh: "Chinese (Simplified)",
  ko: "Korean",
  ru: "Russian",
  ar: "Arabic",
  tr: "Turkish",
  pl: "Polish",
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkTranslateLimit(user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  // Get user's translation language
  const { data: userRow } = await supabase
    .from("users")
    .select("translation_language")
    .eq("id", user.id)
    .single();

  const language = userRow?.translation_language;
  if (!language) {
    return NextResponse.json({ error: "No translation language set" }, { status: 400 });
  }

  const languageName = LANGUAGE_NAMES[language];
  if (!languageName) {
    return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
  }

  // Verify user is a galley member for this recipe
  const { data: recipe } = await supabase
    .from("recipes")
    .select("id, galley_id, description")
    .eq("id", id)
    .single();

  if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

  const { data: membership } = await supabase
    .from("galley_members")
    .select("galley_id")
    .eq("galley_id", recipe.galley_id)
    .eq("user_id", user.id)
    .single();

  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Fetch ingredients and steps in parallel
  const [{ data: ingredients }, { data: steps }] = await Promise.all([
    supabase
      .from("ingredients")
      .select("id, name")
      .eq("recipe_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("preparation_steps")
      .select("id, instruction")
      .eq("recipe_id", id)
      .order("step_number", { ascending: true }),
  ]);

  const prompt = `You are a cooking recipe translator. Translate the following recipe content to ${languageName}.

Return ONLY valid JSON with this exact structure, no markdown, no code blocks:
{
  "description": "<translated description, or null if original is null>",
  "ingredients": [{ "id": "<keep original id>", "name": "<translated ingredient name>" }],
  "steps": [{ "id": "<keep original id>", "instruction": "<translated instruction>" }]
}

Rules:
- Keep amounts and units exactly as they are (do not translate them)
- Preserve the original cooking intent accurately
- Translate ingredient names naturally (e.g. culinary terms, not literal)
- Keep all original ids unchanged

Recipe content to translate:

Description: ${recipe.description ?? "null"}

Ingredients:
${JSON.stringify(ingredients ?? [])}

Steps:
${JSON.stringify(steps ?? [])}`;

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const t0 = Date.now();
  const result = await model.generateContent(prompt);
  const durationMs = Date.now() - t0;
  const inputTokens = result.response.usageMetadata?.promptTokenCount ?? null;
  const outputTokens = result.response.usageMetadata?.candidatesTokenCount ?? null;
  const text = result.response.text().trim();

  let parsed: {
    description: string | null;
    ingredients: { id: string; name: string }[];
    steps: { id: string; instruction: string }[];
  };

  try {
    parsed = JSON.parse(text);
  } catch {
    // Strip markdown fences if Gemini wrapped the response
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (!match) {
      await logAIUsage({
        userId: user.id,
        operation: "translate",
        model: "gemini-2.5-flash",
        inputTokens,
        outputTokens,
        durationMs,
        success: false,
      });
      return NextResponse.json({ error: "Translation failed — invalid response" }, { status: 500 });
    }
    parsed = JSON.parse(match[1]);
  }

  // Upsert translation (overwrite on conflict)
  const { data: translation, error } = await supabase
    .from("recipe_translations")
    .upsert(
      {
        recipe_id: id,
        language,
        description: parsed.description ?? null,
        ingredients: parsed.ingredients ?? [],
        steps: parsed.steps ?? [],
        translated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "recipe_id,language" }
    )
    .select()
    .single();

  if (error) {
    await logAIUsage({
      userId: user.id,
      operation: "translate",
      model: "gemini-2.5-flash",
      inputTokens,
      outputTokens,
      durationMs,
      success: false,
    });
    return NextResponse.json({ error: "Failed to save translation" }, { status: 500 });
  }

  await logAIUsage({
    userId: user.id,
    operation: "translate",
    model: "gemini-2.5-flash",
    inputTokens,
    outputTokens,
    durationMs,
    success: true,
  });

  return NextResponse.json({ translation }, { status: 200 });
}
