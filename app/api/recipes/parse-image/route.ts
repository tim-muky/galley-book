/**
 * POST /api/recipes/parse-image
 *
 * Accepts a multipart FormData with a "photo" field (image file).
 * Uses Claude Vision to extract structured recipe data from the image.
 * Supports cookbook pages, handwritten recipes, printed cards, screenshots.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

  // Map MIME type to what Claude accepts
  const mediaType = (photo.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp") ?? "image/jpeg";

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64,
            },
          },
          {
            type: "text",
            text: `This image shows a recipe. Extract ALL recipe information and return ONLY valid JSON matching this schema:
${RECIPE_SCHEMA}

Rules:
- Extract every ingredient with exact amounts and units visible in the image
- Convert fractions to decimals (½ → 0.5, ¼ → 0.25)
- Unit should be one of: g, kg, ml, l, tsp, tbsp, cup, piece, pinch, slice, clove, handful, "to taste", or null
- prep_time: total time in minutes (combine prep + cooking if both shown)
- If the image is not a recipe, return { "error": "No recipe found in image" }
- Return ONLY JSON, no markdown fences, no explanation`,
          },
        ],
      },
    ],
  });

  const rawText = message.content[0].type === "text" ? message.content[0].text : "";

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 422 });
    }

    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json(
      { error: "Could not read recipe from this photo. Try a clearer image or add manually." },
      { status: 422 }
    );
  }
}
