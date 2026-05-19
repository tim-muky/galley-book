import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAIUsage } from "@/lib/ai-logger";
import { checkParseImageLimit } from "@/lib/rate-limit";
import { getGalleyPlan } from "@/lib/subscription";
import { resolveActiveGalleyId } from "@/lib/active-galley";
import { normalizeRecipeTags } from "@/lib/recipe-prompts";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

const RECIPE_SCHEMA = `{
  "name": "string",
  "description": "string (brief, max 2 sentences)",
  "servings": number,
  "prep_time": number (total minutes),
  "season": "all_year" | "spring" | "summer" | "autumn" | "winter",
  "type": "starter" | "main" | "dessert" | "breakfast" | "snack" | "drink" | "side",
  "cuisine": "string | null (single cuisine label, lowercase, e.g. 'italian', 'thai', 'levantine'; null if not clearly inferable)",
  "main_ingredients": ["string", ... 1–3 dominant ingredients, lowercase, singular, e.g. 'chicken', 'fennel', 'chickpea'],
  "ingredients": [{ "name": "string", "amount": number | null, "unit": "string | null" }],
  "steps": [{ "instruction": "string" }]
}`;

const TAG_RULES = `- cuisine: a single short lowercase label naming the regional/national cuisine (e.g. "italian", "japanese", "moroccan"); null if the dish is not clearly tied to a cuisine
- main_ingredients: 1–3 dominant ingredients only — what the dish is "about". Lowercase, singular, no quantities, no descriptors`;

export async function POST(request: Request) {
  if (!process.env.GOOGLE_AI_API_KEY) {
    return NextResponse.json({ error: "Recipe parsing is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const galleyId = await resolveActiveGalleyId(supabase, user.id);
  if (galleyId) {
    const plan = await getGalleyPlan(supabase, galleyId, user.id);
    if (plan !== "premium") {
      return NextResponse.json(
        { error: "AI recipe import is a premium feature.", upgrade: true },
        { status: 403 },
      );
    }
  }

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

  // GAL-316: extra guidance for handwritten recipe cards / cursive recipe
  // pages. Printed recipes already parse well; the handwriting failure modes
  // are different (cursive numerals, fraction glyphs, smudges, informal
  // shorthand) and benefit from explicit instructions + a thinking budget.
  const HANDWRITING_RULES = `
- Treat the input as possibly handwritten. If you see cursive script, ink/pencil on paper, or recipe-card layout, switch into careful-reading mode:
  - Cursive numerals often confuse 0/6, 1/7, 4/9. Re-check unclear digits against context (e.g. "0.5 kg flour" not "6 kg flour").
  - Fraction glyphs (½ ¼ ⅓ ⅔ ¾ etc.) and mixed numbers ("1 ½") must be converted to decimals.
  - Informal amounts ("a pinch", "a handful", "to taste", "etwas", "prise") map to the closest allowed unit (pinch, handful) or use "to taste". Set amount=null when the source is non-numeric.
  - Common handwritten abbreviations: "TL"/"tsp"/"t" → tsp; "EL"/"tbsp"/"TB" → tbsp; "g"/"gr" → g; "ml" → ml. German recipe abbreviations are common.
  - If a numeric value is genuinely illegible after a careful look, set the amount to null rather than guessing. Better to leave blank than write something the cook can't trust.
- Recipe-card layout often lists ingredients in a column on the left and method below or to the right. Don't accidentally treat method words as ingredients.
- If pen ink is bleeding/smudged or photo is blurry, do your best on the legible parts and leave illegible items out rather than fabricating them.`;

  const prompt = photos.length > 1
    ? `These ${photos.length} images show a single recipe spread across multiple pages (e.g. a cookbook spread, multiple handwritten recipe cards, or front/back of one card). Combine ALL information from every page and extract the complete recipe. Return ONLY valid JSON matching this schema:\n${RECIPE_SCHEMA}\n\nRules:\n- Combine ingredients and steps from all pages in the correct order\n- Extract every ingredient with exact amounts and units\n- Convert fractions to decimals (½ → 0.5, ¼ → 0.25)\n- Unit should be one of: g, kg, ml, l, tsp, tbsp, cup, piece, pinch, slice, clove, handful, "to taste", or null\n- prep_time: total time in minutes (combine prep + cooking if both shown)\n- If none of the images contain a recipe, return { "error": "No recipe found in image" }\n${TAG_RULES}${HANDWRITING_RULES}\n- Return ONLY JSON, no markdown fences, no explanation`
    : `This image shows a recipe. It may be a printed page or a handwritten card — read carefully. Extract ALL recipe information and return ONLY valid JSON matching this schema:\n${RECIPE_SCHEMA}\n\nRules:\n- Extract every ingredient with exact amounts and units visible in the image\n- Convert fractions to decimals (½ → 0.5, ¼ → 0.25)\n- Unit should be one of: g, kg, ml, l, tsp, tbsp, cup, piece, pinch, slice, clove, handful, "to taste", or null\n- prep_time: total time in minutes (combine prep + cooking if both shown)\n- If the image is not a recipe, return { "error": "No recipe found in image" }\n${TAG_RULES}${HANDWRITING_RULES}\n- Return ONLY JSON, no markdown fences, no explanation`;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    // GAL-316: allow a modest thinking budget so the model can disambiguate
    // tricky cursive numerals and fraction glyphs. Printed recipes don't
    // need it but pay the same low fixed overhead.
    generationConfig: { thinkingConfig: { thinkingBudget: 1024 } } as never,
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
    normalizeRecipeTags(parsed);
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
