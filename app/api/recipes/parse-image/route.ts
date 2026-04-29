import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAIUsage } from "@/lib/ai-logger";
import { checkParseImageLimit } from "@/lib/rate-limit";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

const RECIPE_SCHEMA = `{
  "name": "string",
  "description": "string (brief, max 2 sentences)",
  "servings": number,
  "prep_time": number (total minutes),
  "season": "all_year" | "spring" | "summer" | "autumn" | "winter",
  "type": "starter" | "main" | "dessert" | "breakfast" | "snack" | "drink" | "side",
  "ingredients": [{ "name": "string", "amount": number | null, "unit": "string | null" }],
  "steps": [{ "instruction": "string" }]
}`;

export async function POST(request: Request) {
  if (!process.env.GOOGLE_AI_API_KEY) {
    return NextResponse.json({ error: "Recipe parsing is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkParseImageLimit(user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const formData = await request.formData();
  const photos = formData.getAll("photo") as File[];

  if (photos.length === 0) {
    return NextResponse.json({ error: "No photo provided" }, { status: 400 });
  }

  for (const photo of photos) {
    if (!photo.type.startsWith("image/")) {
      return NextResponse.json({ error: "All files must be images" }, { status: 400 });
    }
  }

  const imageParts = await Promise.all(
    photos.map(async (photo) => {
      const arrayBuffer = await photo.arrayBuffer();
      return { inlineData: { data: Buffer.from(arrayBuffer).toString("base64"), mimeType: photo.type } };
    })
  );

  const prompt = photos.length > 1
    ? `These ${photos.length} images show a single recipe spread across multiple pages (e.g. a cookbook spread or multiple recipe cards). Combine ALL information from every page and extract the complete recipe. Return ONLY valid JSON matching this schema:\n${RECIPE_SCHEMA}\n\nRules:\n- Combine ingredients and steps from all pages in the correct order\n- Extract every ingredient with exact amounts and units\n- Convert fractions to decimals (½ → 0.5, ¼ → 0.25)\n- Unit should be one of: g, kg, ml, l, tsp, tbsp, cup, piece, pinch, slice, clove, handful, "to taste", or null\n- prep_time: total time in minutes (combine prep + cooking if both shown)\n- If none of the images contain a recipe, return { "error": "No recipe found in image" }\n- Return ONLY JSON, no markdown fences, no explanation`
    : `This image shows a recipe. Extract ALL recipe information and return ONLY valid JSON matching this schema:\n${RECIPE_SCHEMA}\n\nRules:\n- Extract every ingredient with exact amounts and units visible in the image\n- Convert fractions to decimals (½ → 0.5, ¼ → 0.25)\n- Unit should be one of: g, kg, ml, l, tsp, tbsp, cup, piece, pinch, slice, clove, handful, "to taste", or null\n- prep_time: total time in minutes (combine prep + cooking if both shown)\n- If the image is not a recipe, return { "error": "No recipe found in image" }\n- Return ONLY JSON, no markdown fences, no explanation`;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { thinkingConfig: { thinkingBudget: 0 } } as never,
  });
  const t0 = Date.now();
  const result = await model.generateContent([...imageParts, prompt]);
  const duration = Date.now() - t0;

  const rawText = result.response.text();

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.error) {
      await logAIUsage({
        userId: user.id,
        operation: "parse_image",
        model: "gemini-2.5-flash",
        inputTokens: result.response.usageMetadata?.promptTokenCount ?? null,
        outputTokens:
          (result.response.usageMetadata?.candidatesTokenCount ?? 0) +
            ((result.response.usageMetadata as { thoughtsTokenCount?: number } | undefined)
              ?.thoughtsTokenCount ?? 0) || null,
        durationMs: duration,
        success: false,
      });
      return NextResponse.json({ error: parsed.error }, { status: 422 });
    }

    await logAIUsage({
      userId: user.id,
      operation: "parse_image",
      model: "gemini-2.5-flash",
      inputTokens: result.response.usageMetadata?.promptTokenCount ?? null,
      outputTokens:
        (result.response.usageMetadata?.candidatesTokenCount ?? 0) +
          ((result.response.usageMetadata as { thoughtsTokenCount?: number } | undefined)
            ?.thoughtsTokenCount ?? 0) || null,
      durationMs: duration,
      success: true,
    });
    return NextResponse.json(parsed);
  } catch {
    await logAIUsage({
      userId: user.id,
      operation: "parse_image",
      model: "gemini-2.5-flash",
      inputTokens: result.response.usageMetadata?.promptTokenCount ?? null,
      outputTokens:
        (result.response.usageMetadata?.candidatesTokenCount ?? 0) +
          ((result.response.usageMetadata as { thoughtsTokenCount?: number } | undefined)
            ?.thoughtsTokenCount ?? 0) || null,
      durationMs: duration,
      success: false,
    });
    return NextResponse.json(
      { error: "Could not read recipe from this photo. Try a clearer image or add manually." },
      { status: 422 }
    );
  }
}
