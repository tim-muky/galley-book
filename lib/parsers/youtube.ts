import { GoogleGenerativeAI } from "@google/generative-ai";
import type { FetchResult, ImageSource, ParsedVia } from "./types";
import { firstUsable } from "./utils";
import { fetchViaPerplexity } from "./perplexity";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export function isYouTubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url);
}

/** Extract YouTube video ID from any YouTube URL format */
export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Canonical watch URL — Perplexity and Gemini handle /watch?v= more reliably than /shorts/ */
export function canonicalYouTubeUrl(url: string): string {
  const id = extractYouTubeVideoId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : url;
}

/** YouTube thumbnails — validates each variant, returns cover + up to 3 snapshot frames */
async function extractYouTubeThumbnails(url: string): Promise<string[]> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return [];

  // Cover frame quality variants (creator-chosen thumbnail at different resolutions)
  const coverVariants = ["maxresdefault", "sddefault", "hqdefault", "0"];
  // Auto-generated snapshot frames at ~25%, ~50%, ~75% through the video
  const snapshotVariants = ["1", "2", "3"];

  const allUrls = [
    ...coverVariants.map((v) => `https://img.youtube.com/vi/${videoId}/${v}.jpg`),
    ...snapshotVariants.map((v) => `https://img.youtube.com/vi/${videoId}/${v}.jpg`),
  ];

  const results = await Promise.allSettled(
    allUrls.map(async (thumbUrl) => {
      const res = await fetch(thumbUrl, { method: "HEAD", signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error("not found");
      return thumbUrl;
    })
  );

  const valid = results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value);

  // Take best available cover quality (first valid from coverVariants), then snapshots
  const coverUrl = valid.find((u) => coverVariants.some((v) => u.endsWith(`/${v}.jpg`)));
  const snapshots = valid.filter((u) => snapshotVariants.some((v) => u.endsWith(`/${v}.jpg`)));

  return [coverUrl, ...snapshots].filter((u): u is string => !!u);
}

/** Extract `ytInitialPlayerResponse` from a YouTube watch-page HTML using
 *  balanced-brace parsing instead of a regex. The previous regex anchor
 *  (`};(?:var|</script>)` after a non-greedy match) was picking up the wrong
 *  closing brace — JSON.parse would succeed on a shorter unrelated config
 *  blob with no videoDetails, silently falling through. Confirmed via
 *  GAL-152 logs (10/10 production calls hit this failure mode). */
function extractYtInitialPlayer(html: string): Record<string, unknown> | null {
  const idx = html.indexOf("ytInitialPlayerResponse");
  if (idx < 0) return null;
  const start = html.indexOf("{", idx);
  if (start < 0) return null;
  let depth = 0;
  let i = start;
  let inStr = false;
  let esc = false;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === "\"") { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  if (depth !== 0) return null;
  try {
    return JSON.parse(html.slice(start, i)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Scrape the YouTube watch page for the creator-written title and description.
 *  Many recipe creators put the full ingredient list and steps in the description —
 *  this is faster, cheaper, and more accurate than transcript / video / Perplexity routes.
 *  Falls back through 3 strategies because YouTube serves different page variants
 *  by region/UA/cookies (notably the EU consent gate which blanks the page on
 *  Frankfurt-region Vercel functions). */
async function fetchYouTubeWatchPageMeta(
  url: string
): Promise<{ title: string; description: string } | null> {
  const watchUrl = canonicalYouTubeUrl(url);
  // Pre-accept the EU consent gate so the watch page returns content rather
  // than the consent interstitial when called from EU serverless regions.
  const consentCookie = "CONSENT=YES+cb.20210328-17-p0.en+FX+000; SOCS=CAI";

  // Strategy 1+2: fetch the watch page, try the canonical JSON anchor first,
  // fall back to a direct string scrape of the embedded fields.
  try {
    const res = await fetch(`${watchUrl}&hl=en&persist_hl=1`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: consentCookie,
      },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const html = await res.text();

      // Strategy 1: parse ytInitialPlayerResponse JSON via balanced-brace extraction
      const player = extractYtInitialPlayer(html);
      if (player) {
        const details = player.videoDetails as Record<string, unknown> | undefined;
        if (details) {
          const title = typeof details.title === "string" ? details.title : "";
          const description =
            typeof details.shortDescription === "string" ? details.shortDescription : "";
          if (title || description) return { title, description };
        }
      }

      // Strategy 2: direct string scrape inside the videoDetails block — narrows
      // the search so we don't grab some unrelated short "title" field elsewhere
      // in the page (e.g. a button label).
      const decode = (s: string): string => {
        try { return JSON.parse(`"${s}"`) as string; } catch { return s; }
      };
      const detailsBlock = html.match(/"videoDetails":\s*(\{[\s\S]*?\})\s*,\s*"playerConfig"/);
      const detailsHtml = detailsBlock?.[1] ?? html;
      const titleMatch = detailsHtml.match(/"title":"((?:[^"\\]|\\.)*?)"/);
      const descMatch = detailsHtml.match(/"shortDescription":"((?:[^"\\]|\\.)*?)"/);
      if (titleMatch || descMatch) {
        const title = titleMatch ? decode(titleMatch[1]) : "";
        const description = descMatch ? decode(descMatch[1]) : "";
        if (title || description) return { title, description };
      }
    }
  } catch {
    // Fall through to oEmbed
  }

  // Strategy 3: oEmbed for the title only — public, no auth, never gated.
  // Useful as a last-resort so the title is still available to enrich
  // transcript / Perplexity content downstream.
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.title === "string" && data.title) {
        return { title: data.title, description: "" };
      }
    }
  } catch {
    // Fall through
  }

  return null;
}

/** Heuristic — does this YouTube description look like it contains a real recipe?
 *  Recipe descriptions usually have ingredient amounts (numbers + units) and either
 *  a list-style structure or step keywords. We use this to decide whether the
 *  description is rich enough to skip transcript/video/Perplexity. */
function descriptionLooksLikeRecipe(description: string): boolean {
  if (description.length < 150) return false;
  // Numbered or bulleted list lines — characteristic of ingredient/step lists
  const listLines = (description.match(/^\s*(?:[-•*]|\d+[.)])\s+/gm) ?? []).length;
  // Quantity hints — number adjacent to a unit (works in EN + DE; fractions ½ ¼ etc count too)
  const quantities = (
    description.match(
      /(?:\b\d+(?:[.,/]\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])\s*(g|kg|ml|l|tsp|tbsp|tl|el|cup|cups|tasse|tassen|ounce|oz|lb|piece|pieces|st(?:k|ück)?|prise|clove|cloves|zehe|zehen|slice|handful|handvoll|stick)s?\b/gi
    ) ?? []
  ).length;
  // Mention of "ingredients" / "recipe" / "zutaten" headers is also a strong signal
  const hasRecipeHeader =
    /\b(ingredients?|recipe|zutaten|rezept|method|directions|instructions)\b/i.test(description);
  if (listLines >= 2 || quantities >= 2) return true;
  if (hasRecipeHeader && (listLines >= 1 || quantities >= 1)) return true;
  return false;
}

/** Fetch YouTube captions by scraping the watch page for caption tracks and
 *  fetching the timedtext JSON directly. Replaces the old `youtube-transcript`
 *  dep which broke when YouTube changed their endpoints. No external library —
 *  same consent-cookie strategy as fetchYouTubeWatchPageMeta. */
async function fetchYouTubeTranscript(url: string): Promise<string | null> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;
  const watchUrl = canonicalYouTubeUrl(url);
  const consentCookie = "CONSENT=YES+cb.20210328-17-p0.en+FX+000; SOCS=CAI";

  try {
    const pageRes = await fetch(`${watchUrl}&hl=en&persist_hl=1`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: consentCookie,
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();

    // Caption tracks live inside ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks[]
    const player = extractYtInitialPlayer(html);
    if (!player) return null;
    const captions = (player.captions as Record<string, unknown> | undefined)
      ?.playerCaptionsTracklistRenderer as Record<string, unknown> | undefined;
    const tracks = captions?.captionTracks as Array<Record<string, unknown>> | undefined;
    if (!tracks || tracks.length === 0) return null;

    // Pick best track: English manual first, then English auto-generated, then any English, then first available
    const isEn = (t: Record<string, unknown>) => /^en/i.test(String(t.languageCode ?? ""));
    const isAsr = (t: Record<string, unknown>) => String(t.kind ?? "") === "asr";
    const track =
      tracks.find((t) => isEn(t) && !isAsr(t)) ??
      tracks.find((t) => isEn(t)) ??
      tracks[0];
    const baseUrl = typeof track.baseUrl === "string" ? track.baseUrl : null;
    if (!baseUrl) return null;

    // Request fmt=json3 for clean JSON instead of XML.
    const trackUrl = baseUrl + (baseUrl.includes("fmt=") ? "" : "&fmt=json3");
    const captionsRes = await fetch(trackUrl, { signal: AbortSignal.timeout(5000) });
    if (!captionsRes.ok) return null;
    const data = (await captionsRes.json()) as {
      events?: Array<{ segs?: Array<{ utf8?: string }> }>;
    };
    const text = (data.events ?? [])
      .flatMap((e) => e.segs ?? [])
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 50) return null;
    return text.slice(0, 20000);
  } catch {
    return null;
  }
}

/** Ask Gemini to watch the YouTube video directly and extract the recipe */
async function analyzeYouTubeVideoWithGemini(url: string, timeoutMs = 25000): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await Promise.race([
    model.generateContent([
      { fileData: { mimeType: "video/mp4", fileUri: url } },
      {
        text: "Watch this cooking video and extract the full recipe. Return: recipe name, all ingredients with exact amounts and units, all preparation steps in order (one discrete action per step, do NOT merge into a single block), servings count, and total prep/cook time in minutes. Plain text only, no commentary.",
      },
    ]),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini video analysis timeout")), timeoutMs)
    ),
  ]);
  return result.response.text();
}

export async function parseYouTube(url: string): Promise<FetchResult> {
  // Community Posts, channel pages, etc. have no video ID — skip video-specific routes
  // to avoid Gemini video analysis timeout blowing the maxDuration budget.
  if (!extractYouTubeVideoId(url)) {
    if (process.env.PERPLEXITY_API_KEY) {
      const content = await fetchViaPerplexity(url, {
        kind: "youtube",
        canonicalUrl: canonicalYouTubeUrl(url),
      });
      if (content.length > 200 && !content.startsWith("Unable to find recipe")) {
        return {
          content,
          imageUrl: null,
          imageCandidates: [],
          parsedVia: "youtube_perplexity",
          imageSource: "none",
        };
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

  // Fetch thumbnails, watch-page meta, and transcript in parallel — cheapest first wins.
  const [thumbnails, watchMeta, transcript] = await Promise.all([
    extractYouTubeThumbnails(url),
    fetchYouTubeWatchPageMeta(url),
    fetchYouTubeTranscript(url),
  ]);
  const imageUrl = thumbnails[0] ?? null;
  const imageSource: ImageSource = imageUrl ? "youtube_thumbnail" : "none";

  // Route 1: watch-page description — many recipe creators post the full recipe here.
  // Fast (~1s), free, deterministic — by far the best signal when present.
  if (watchMeta && descriptionLooksLikeRecipe(watchMeta.description)) {
    const content = `Title: ${watchMeta.title}\n\nDescription:\n${watchMeta.description}`;
    return {
      content,
      imageUrl,
      imageCandidates: thumbnails,
      parsedVia: "youtube_description",
      imageSource,
    };
  }

  // Route 2: transcript — most videos have captions, near-zero cost
  if (transcript && transcript.length > 200) {
    // Prepend the title so the model has a confident dish name even if the transcript starts mid-sentence
    const titleLine = watchMeta?.title ? `Title: ${watchMeta.title}\n\n` : "";
    return {
      content: `${titleLine}${transcript}`,
      imageUrl,
      imageCandidates: thumbnails,
      parsedVia: "youtube_transcript",
      imageSource,
    };
  }

  // Routes 3+4: race Gemini-video and Perplexity in parallel — whichever
  // returns a usable result first wins. Cuts ~10–15s off the worst case
  // versus running them sequentially. We pay for both calls when neither
  // path is dominant; acceptable trade since most cases hit the description
  // / transcript path now and never reach this branch.
  const titleLine = watchMeta?.title ? `Title: ${watchMeta.title}\n\n` : "";
  const hasPerplexity = !!process.env.PERPLEXITY_API_KEY;

  const videoPromise: Promise<{ via: ParsedVia; content: string } | null> =
    analyzeYouTubeVideoWithGemini(canonicalYouTubeUrl(url))
      .then((c) => (c.length > 200 ? { via: "youtube_video" as ParsedVia, content: c } : null))
      .catch(() => null);

  const perplexityPromise: Promise<{ via: ParsedVia; content: string } | null> = hasPerplexity
    ? fetchViaPerplexity(url, { kind: "youtube", canonicalUrl: canonicalYouTubeUrl(url) })
        .then((c) =>
          c.length > 200 && !c.startsWith("Unable to find recipe")
            ? { via: "youtube_perplexity" as ParsedVia, content: `${titleLine}${c}` }
            : null
        )
        .catch(() => null)
    : Promise.resolve(null);

  const winner = await firstUsable([videoPromise, perplexityPromise]);
  if (winner) {
    return {
      content: winner.content,
      imageUrl,
      imageCandidates: thumbnails,
      parsedVia: winner.via,
      imageSource,
    };
  }

  return {
    content: "",
    imageUrl,
    imageCandidates: thumbnails,
    parsedVia: "none",
    imageSource,
    error:
      "Could not extract a recipe from this YouTube video. The description has no recipe text and the video has no usable captions. Try pasting the recipe manually.",
  };
}
