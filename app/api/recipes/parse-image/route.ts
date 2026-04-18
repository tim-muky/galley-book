/**
 * POST /api/recipes/parse-image
 *
 * Accepts a multipart FormData with a "photo" field (image file).
 * Uses Gemini Vision to extract structured recipe data from the image.
 * Supports cookbook pages, handwritten recipes, printed cards, screenshots.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAIUsage } from "@/lib/ai-logger";

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

  const formData = await request.formData();
  const photo = formData.get("photo") as File | null;

  if (!photo) {
    return NextResponse.json({ error: "No photo provided" }, { status: 400 });
  }

  // Validate file type
  if (!photo.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }

  // Convert to base64
  const arrayBuffer = await photo.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const t0 = Date.now();
  const result = await model.generateContent([
    {
      inlineData: {
        data: base64,
        mimeType: photo.type,
      },
    },
    `This image shows a recipe. Extract ALL recipe information and return ONLY valid JSON matching this schema:
${RECIPE_SCHEMA}

Rules:
- Extract every ingredient with exact amounts and units visible in the image
- Convert fractions to decimals (½ → 0.5, ¼ → 0.25)
- Unit should be one of: g, kg, ml, l, tsp, tbsp, cup, piece, pinch, slice, clove, handful, "to taste", or null
- prep_time: total time in minutes (combine prep + cooking if both shown)
- If the image is not a recipe, return { "error": "No recipe found in image" }
- Return ONLY JSON, no markdown fences, no explanation`,
  ]);
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
        outputTokens: result.response.usageMetadata?.candidatesTokenCount ?? null,
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
      outputTokens: result.response.usageMetadata?.candidatesTokenCount ?? null,
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
      outputTokens: result.response.usageMetadata?.candidatesTokenCount ?? null,
      durationMs: duration,
      success: false,
    });
    return NextResponse.json(
      { error: "Could not read recipe from this photo. Try a clearer image or add manually." },
      { status: 422 }
    );
  }
}
