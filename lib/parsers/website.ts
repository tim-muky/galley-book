import type { FetchResult, ImageSource } from "./types";
import { extractImageUrl, normalizeImageUrl } from "./utils";
import { fetchViaPerplexity } from "./perplexity";

function isRecipeType(item: Record<string, unknown>): boolean {
  const t = item["@type"];
  return t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"));
}

/** Slugify-ish: lowercase, ASCII-fold accents, drop non-alphanumeric. */
function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
}

function instructionCount(instructions: unknown): number {
  if (typeof instructions === "string") return instructions.length > 20 ? 1 : 0;
  if (!Array.isArray(instructions)) return 0;
  let count = 0;
  for (const step of instructions) {
    if (typeof step === "string") {
      count += 1;
    } else if (step && typeof step === "object") {
      const s = step as Record<string, unknown>;
      if (s["@type"] === "HowToSection" && Array.isArray(s.itemListElement)) {
        count += s.itemListElement.length;
      } else {
        count += 1;
      }
    }
  }
  return count;
}

/** Score a Recipe candidate so we can pick the page's primary recipe when
 *  multiple are embedded (sidebar widgets, "you might also like" sections). */
function scoreRecipe(recipe: Record<string, unknown>, urlTokens: string[]): number {
  const ingredients = Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient.length : 0;
  const steps = instructionCount(recipe.recipeInstructions);
  let score = ingredients * 2 + steps * 3;

  // Slug-match bonus: name shares meaningful tokens with the URL path.
  const name = typeof recipe.name === "string" ? recipe.name : "";
  if (name && urlTokens.length > 0) {
    const nameTokens = tokens(name);
    const overlap = nameTokens.filter((t) => urlTokens.includes(t)).length;
    if (overlap > 0) score += overlap * 25;
  }

  // mainEntity / mainEntityOfPage hint that this is the page's primary entity.
  if (recipe.mainEntityOfPage || recipe["@id"]) score += 5;

  return score;
}

/** Extract Schema.org Recipe from JSON-LD script tags. When multiple Recipe
 *  objects exist (sidebar widgets, related recipes), the one whose name
 *  matches the page URL slug — or has the most fields — wins. */
function extractJsonLd(
  html: string,
  pageUrl?: string
): Record<string, unknown> | null {
  const candidates: Record<string, unknown>[] = [];
  const scriptMatches = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const match of scriptMatches) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const obj = item as Record<string, unknown>;
        if (isRecipeType(obj)) candidates.push(obj);
        // Some sites wrap recipes in @graph
        const graph = obj["@graph"];
        if (Array.isArray(graph)) {
          for (const g of graph) {
            const gObj = g as Record<string, unknown>;
            if (isRecipeType(gObj)) candidates.push(gObj);
          }
        }
      }
    } catch {
      continue;
    }
  }

  if (candidates.length === 0) return null;

  let urlTokens: string[] = [];
  if (pageUrl) {
    try {
      urlTokens = tokens(new URL(pageUrl).pathname);
    } catch {
      /* leave urlTokens empty */
    }
  }

  // Pick the highest-scoring candidate; ties broken by document order.
  let best = candidates[0];
  let bestScore = scoreRecipe(best, urlTokens);
  for (let i = 1; i < candidates.length; i++) {
    const score = scoreRecipe(candidates[i], urlTokens);
    if (score > bestScore) {
      best = candidates[i];
      bestScore = score;
    }
  }

  // Reject Recipe stubs: some article pages embed @type Recipe with just a
  // name and image but no actual content. Returning the stub blocks the
  // Perplexity fallback that would have found the real recipe (GAL-176).
  const ingredients = Array.isArray(best.recipeIngredient) ? best.recipeIngredient.length : 0;
  const steps = instructionCount(best.recipeInstructions);
  if (ingredients < 3 && steps === 0) return null;

  return best;
}

/** Serialize JSON-LD Recipe into clean structured text for the model */
function formatJsonLdForModel(jsonLd: Record<string, unknown>): string {
  const lines: string[] = [];

  if (jsonLd.name) lines.push(`Recipe: ${jsonLd.name}`);
  if (jsonLd.description) {
    const desc = jsonLd.description;
    lines.push(`Description: ${typeof desc === "string" ? desc : JSON.stringify(desc)}`);
  }
  if (jsonLd.recipeCuisine) lines.push(`Cuisine: ${jsonLd.recipeCuisine}`);
  if (jsonLd.keywords) lines.push(`Keywords: ${jsonLd.keywords}`);
  if (jsonLd.recipeCategory) lines.push(`Category: ${jsonLd.recipeCategory}`);

  const yld = jsonLd.recipeYield;
  if (yld) lines.push(`Yield: ${Array.isArray(yld) ? yld[0] : yld}`);

  if (jsonLd.prepTime) lines.push(`Prep time: ${jsonLd.prepTime}`);
  if (jsonLd.cookTime) lines.push(`Cook time: ${jsonLd.cookTime}`);
  if (jsonLd.totalTime) lines.push(`Total time: ${jsonLd.totalTime}`);

  const ingredients = jsonLd.recipeIngredient;
  if (Array.isArray(ingredients) && ingredients.length > 0) {
    lines.push("\nIngredients:");
    for (const ing of ingredients) lines.push(`- ${ing}`);
  }

  const instructions = jsonLd.recipeInstructions;
  if (typeof instructions === "string" && instructions.trim()) {
    // Many European sites encode the whole method as one string blob — split
    // on sentence boundaries so Gemini sees discrete steps. Keeping the raw
    // text as a single line caused 0-step partials (GAL-175).
    lines.push("\nInstructions:");
    const sentences = instructions
      .split(/(?<=[.!?])\s+(?=[A-ZÄÖÜÉÈÀÇÑ])/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length > 1) {
      for (const sentence of sentences) lines.push(`- ${sentence}`);
    } else {
      lines.push(`- ${instructions.trim()}`);
    }
  } else if (Array.isArray(instructions) && instructions.length > 0) {
    lines.push("\nInstructions:");
    for (const step of instructions) {
      if (typeof step === "string") {
        lines.push(`- ${step}`);
      } else if (step && typeof step === "object") {
        const s = step as Record<string, unknown>;
        if (s["@type"] === "HowToSection") {
          if (s.name) lines.push(`\n${s.name}:`);
          const sectionSteps = s.itemListElement;
          if (Array.isArray(sectionSteps)) {
            for (const ss of sectionSteps) {
              const sso = ss as Record<string, unknown>;
              lines.push(`- ${sso.text ?? sso.name ?? ""}`);
            }
          }
        } else {
          lines.push(`- ${s.text ?? s.name ?? ""}`);
        }
      }
    }
  }

  return lines.join("\n");
}

/** Extract image URL from JSON-LD Recipe image field */
function extractJsonLdImage(jsonLd: Record<string, unknown>): string | null {
  const img = jsonLd.image;
  if (!img) return null;
  if (typeof img === "string") return normalizeImageUrl(img);
  if (Array.isArray(img) && img.length > 0) {
    const first = img[0];
    if (typeof first === "string") return normalizeImageUrl(first);
    if (first && typeof first === "object") {
      const url = (first as Record<string, unknown>).url;
      return typeof url === "string" ? normalizeImageUrl(url) : null;
    }
  }
  if (typeof img === "object") {
    const url = (img as Record<string, unknown>).url;
    return typeof url === "string" ? normalizeImageUrl(url) : null;
  }
  return null;
}

export async function parseWebsite(url: string): Promise<FetchResult> {
  // Always do a direct fetch first — JSON-LD gives us exact structured data
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "de,en-US;q=0.8,en;q=0.5",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const html = await res.text();
      const ogImageUrl = extractImageUrl(html);
      const jsonLd = extractJsonLd(html, url);

      if (jsonLd) {
        const jsonLdImage = extractJsonLdImage(jsonLd);
        const imageUrl = jsonLdImage ?? ogImageUrl;
        const imageCandidates = imageUrl ? [imageUrl] : [];
        const imageSource: ImageSource = jsonLdImage
          ? "jsonld_image"
          : ogImageUrl
          ? "og_image"
          : "none";
        return {
          content: formatJsonLdForModel(jsonLd),
          imageUrl,
          imageCandidates,
          parsedVia: "jsonld",
          imageSource,
        };
      }

      // No JSON-LD: try Perplexity for cleaner content on JS-heavy pages
      if (process.env.PERPLEXITY_API_KEY) {
        try {
          const perplexityContent = await fetchViaPerplexity(url, { kind: "generic" });
          if (perplexityContent.length > 200) {
            const imageCandidates = ogImageUrl ? [ogImageUrl] : [];
            const imageSource: ImageSource = ogImageUrl ? "og_image" : "none";
            return {
              content: perplexityContent,
              imageUrl: ogImageUrl,
              imageCandidates,
              parsedVia: "perplexity",
              imageSource,
            };
          }
        } catch {
          /* fall through to stripped HTML */
        }
      }

      // Last resort: strip structural/noise elements, then tags
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
        .replace(/<template[^>]*>[\s\S]*?<\/template>/gi, "")
        .replace(/<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 15000);
      const imageCandidates = ogImageUrl ? [ogImageUrl] : [];
      const imageSource: ImageSource = ogImageUrl ? "og_image" : "none";
      return {
        content: text,
        imageUrl: ogImageUrl,
        imageCandidates,
        parsedVia: "html_text",
        imageSource,
      };
    }
  } catch {
    /* fall through */
  }

  // Network error — try Perplexity as last resort
  if (process.env.PERPLEXITY_API_KEY) {
    try {
      const content = await fetchViaPerplexity(url, { kind: "generic" });
      if (content.length > 200)
        return {
          content,
          imageUrl: null,
          imageCandidates: [],
          parsedVia: "perplexity",
          imageSource: "none",
        };
    } catch {
      /* give up */
    }
  }

  return {
    content: `Recipe from: ${url}`,
    imageUrl: null,
    imageCandidates: [],
    parsedVia: "none",
    imageSource: "none",
  };
}
