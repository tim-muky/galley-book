/** Use Perplexity to search for recipe content — good for Instagram, JS-heavy pages.
 *
 *  Single attempt, capped at 12s. Earlier this code retried once on 504/timeout
 *  with two 15s budgets — but that gave a 30s worst case which is exactly the
 *  Vercel proxy timeout for non-streaming responses on Hobby plans. Result: 504s
 *  in the user's face instead of a typed "service slow" error. Better to fail
 *  fast and let the YouTube parser fall through to its other routes (or surface
 *  a clean 422 to the caller) than to spend 30s producing a 504. See GAL-139. */

type PerplexityKind = "youtube" | "instagram" | "generic";

interface PerplexityOptions {
  kind: PerplexityKind;
  canonicalUrl?: string;
}

export async function fetchViaPerplexity(
  url: string,
  options: PerplexityOptions
): Promise<string> {
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  const shortcode = match?.[1] ?? "";
  const canonicalUrl = options.canonicalUrl ?? url;

  const prompt =
    options.kind === "instagram"
      ? `I need the EXACT recipe from this specific Instagram post only: ${url}
Post ID / shortcode: ${shortcode}
Do NOT return recipes from other posts or accounts.
Fetch this exact URL and extract ONLY the recipe shown in this specific post.
Return: recipe name, complete ingredient list with exact amounts and units, all preparation steps in order, servings, total prep/cook time.
If you cannot access this exact post, say "Unable to access this Instagram post" and nothing else.`
      : options.kind === "youtube"
      ? `Find the recipe from this YouTube video: ${canonicalUrl}
Search the web (creator's blog, video description, third-party transcripts) for the SAME recipe shown in this specific video.
Return EVERY field below, each on its own labelled line:
- Recipe name:
- Servings:
- Total time (prep + cook, in minutes):
- Ingredients (one per line, with exact amounts and units):
- Steps (numbered, one discrete cooking action per step — do NOT merge into a single block):
If you cannot find the specific recipe from this video, return "Unable to find recipe" and nothing else.
No commentary, raw recipe content only.`
      : `Fetch this URL and return the full recipe content: ${url}
Include: recipe name, all ingredients with amounts and units, all preparation steps, servings, and prep time.
Return only the raw recipe content, no commentary.`;

  const callOnce = async (timeoutMs: number) => {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res;
  };

  let res: Response;
  try {
    res = await callOnce(12000);
  } catch {
    return "";
  }

  if (!res.ok) return "";

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}
