export type ParsedVia =
  | "instagram_caption"
  | "instagram_perplexity"
  | "youtube_description"
  | "youtube_transcript"
  | "youtube_video"
  | "youtube_perplexity"
  | "tiktok"
  | "jsonld"
  | "perplexity"
  | "html_text"
  | "none";

export type ImageSource =
  | "instagram_embed"
  | "youtube_thumbnail"
  | "tiktok_thumbnail"
  | "jsonld_image"
  | "og_image"
  | "none";

const RECIPE_SCHEMA = `{
  "name": "string",
  "description": "string (brief, max 2 sentences)",
  "servings": number,
  "prep_time": number (in minutes),
  "season": "all_year" | "spring" | "summer" | "autumn" | "winter",
  "type": "starter" | "main" | "dessert" | "breakfast" | "snack" | "drink" | "side",
  "cuisine": "string | null (single cuisine label, lowercase, e.g. 'italian', 'thai', 'levantine'; null if not clearly inferable)",
  "main_ingredients": ["string", ... 1–3 dominant ingredients, lowercase, singular, e.g. 'chicken', 'fennel', 'chickpea'],
  "image_url": "string | null (direct image URL if found)",
  "ingredients": [{ "name": "string", "amount": number | null, "unit": "string | null", "group": "string | null" }],
  "steps": [{ "instruction": "string" }]
}`;

const COMMON_RULES = `Common rules:
- Convert all ingredient amounts to numbers (e.g. "½" → 0.5, "1/3" → 0.33)
- Unit should be one of: g, kg, ml, l, tsp, tbsp, cup, piece, pinch, slice, clove, handful, "to taste", or null
- prep_time: total active + passive cooking time in minutes
- season: infer from dish characteristics if not stated
- type: infer from dish if not stated (default "main")
- cuisine: a single short lowercase label naming the regional/national cuisine (e.g. "italian", "japanese", "moroccan", "tex-mex"); null if the dish is not clearly tied to a cuisine
- main_ingredients: 1–3 dominant ingredients only — what the dish is "about" (e.g. for "chicken tikka masala" → ["chicken"]; for "fennel & orange salad" → ["fennel", "orange"]). Lowercase, singular, no quantities, no descriptors
- ingredients.group: if ingredients are divided into sections (e.g. "Marinade", "Sauce", "Dressing"), set group to the section name; otherwise null
- Return null for fields you cannot determine
- Return ONLY JSON, no markdown, no explanation`;

function sourceGuidance(parsedVia: ParsedVia, hasImage: boolean): string {
  switch (parsedVia) {
    case "jsonld":
      return [
        "The content below is already-structured Schema.org Recipe data extracted from a recipe website.",
        "Format it into the schema. Do NOT invent fields — if a value is missing from the source, return null.",
        "Trust ingredient amounts and units as given; only normalise their form (½ → 0.5).",
      ].join(" ");

    case "instagram_caption":
      return [
        "The content below is a short Instagram caption (post or reel) — informal, often partial, sometimes in a non-English language.",
        hasImage
          ? "An image of the dish (cover frame for reels) is attached. Use it to infer dish type, season, plating, visible ingredients, and a confident name even when the caption is terse."
          : "",
        "Be aggressive about inferring servings, prep_time, type, and season from the dish description and (if attached) image.",
        "For ingredients and steps, use ONLY what is literally written in the caption. Do not invent a procedure if the caption omits one — visible ingredients in the image are fine to list, but never invent steps from a photo.",
        "If the caption is only a hashtag list and no recipe content can be extracted, return null for every field except name (which may come from the image).",
      ].filter(Boolean).join(" ");

    case "tiktok":
      return [
        "The content below is a short social-media caption — informal, often partial, sometimes in a non-English language.",
        "Be aggressive about inferring servings, prep_time, type, and season from the dish description.",
        "For ingredients and steps, use ONLY what is literally written. Do not invent a procedure if the caption omits one.",
        "If the caption is only a hashtag list or has no recipe content, return null for every field except name.",
      ].join(" ");

    case "instagram_perplexity":
    case "youtube_perplexity":
    case "perplexity":
      return [
        "The content below is a web-search summary. It MAY not be a recipe at all.",
        "First decide: does this describe a cookable dish? If it is a news article, restaurant review, profile page, or product listing, return name=null and empty arrays.",
        "If it is a recipe, extract conservatively — prefer null over guessing when the summary is vague.",
        "Steps: split the procedure into discrete cooking actions. Use numbered markers ('1.', '2.'), bullet points, and transitions ('first', 'then', 'next', 'meanwhile', 'finally') as split points when present. If the procedure is written as continuous prose without explicit markers, split on sentence boundaries — each sentence describing a cooking action becomes one step. NEVER return an empty steps array when ingredients are present and any cooking method is described. Over-splitting (one sentence per step) is always preferred over under-splitting (whole method as one step).",
        "prep_time: if the source states a total/cook/prep time, use it. Otherwise infer a reasonable estimate from the recipe complexity (rough guide: 15min for a one-pan / no-cook dish, 30–45min for a typical weeknight main, 60+min for braises, doughs that proof, or anything baked >30min). Only return null if you genuinely cannot tell what the dish is.",
      ].join(" ");

    case "youtube_description":
      return [
        "The content below is the YouTube video title and the creator-written description.",
        "Recipe creators commonly post the full ingredient list and steps in the description — extract them directly when present.",
        "The title is authoritative for the recipe name. Steps and ingredients in the description are the cook's own words; trust them and only normalise units (½ → 0.5).",
        "Ignore promotional lines, channel links, social handles, sponsor mentions, timestamps (e.g. '0:42 Step 1'), and any 'subscribe' / 'follow me' boilerplate.",
        "If the description is just a one-liner with no recipe content, return name from the title and null/empty for the rest — do not invent ingredients or steps.",
      ].join(" ");

    case "youtube_transcript":
      return [
        "The content below is a YouTube transcript — spoken, time-stamped, informal.",
        'Convert spoken amounts ("a quarter cup", "two tablespoons", "a pinch of") into numeric ingredient entries.',
        "Combine related transcript lines into single coherent cooking steps — do NOT return one step per transcript line.",
        "Ignore filler ('like', 'so', 'okay'), sponsor reads, channel intros, and outros.",
      ].join(" ");

    case "youtube_video":
      return [
        "The content below was produced by Gemini watching the video directly. It is already a structured description of the dish.",
        "Extract directly. Steps may be high-level — keep them as a clean numbered procedure.",
      ].join(" ");

    case "html_text":
      return [
        "The content below is stripped HTML from a recipe page that did not expose structured data.",
        "Extract carefully. Ignore navigation, related-recipe lists, comments, and reviews.",
        "Prefer ingredients that appear in a list and steps that appear under headings like 'Method', 'Directions', or 'Preparation'.",
      ].join(" ");

    case "none":
      return "";
  }
}

export function buildRecipePrompt(
  parsedVia: ParsedVia,
  content: string,
  imageUrl: string | null,
  hasInlineImage: boolean = false
): string {
  const guidance = sourceGuidance(parsedVia, hasInlineImage);

  return `Extract the recipe and return ONLY valid JSON matching this schema:
${RECIPE_SCHEMA}

${guidance ? `Source-specific guidance: ${guidance}\n\n` : ""}${COMMON_RULES}
- image_url: set to ${imageUrl ? `"${imageUrl}"` : "null"} (use this value as-is)

Content:
${content}`;
}
