/**
 * POST /api/recipes/parse
 *
 * Accepts a URL (Instagram, YouTube, TikTok, website) and uses Gemini to
 * extract structured recipe data. The per-platform parsers in lib/parsers/*
 * own URL-specific scraping; this handler is just dispatch + Gemini + logging.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSafeUrlAsync } from "@/lib/utils/url-validation";
import { logAIUsage } from "@/lib/ai-logger";
import { checkParseLimit } from "@/lib/rate-limit";
import { buildRecipePrompt } from "@/lib/recipe-prompts";
import { fetchPageContent, fetchInlineImage, cacheInstagramImage } from "@/lib/parsers";
import { z } from "zod";

const ParseSchema = z.object({
  url: z.string().min(1).max(2000),
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

  const rl = await checkParseLimit(user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const body = await request.json();
  const parsedBody = ParseSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }
  const { url } = parsedBody.data;

  // SSRF guard — reject private IPs, loopback, cloud metadata endpoints,
  // non-HTTP schemes, and any hostname whose DNS resolves to private space
  // (defends against DNS rebinding).
  if (!(await isSafeUrlAsync(url.trim()))) {
    return NextResponse.json({ error: "Invalid or disallowed URL." }, { status: 400 });
  }

  const {
    content: pageContent,
    imageUrl: rawImageUrl,
    imageCandidates: rawImageCandidates,
    parsedVia,
    imageSource,
    error: fetchError,
  } = await fetchPageContent(url);

  if (fetchError) {
    return NextResponse.json({ error: fetchError }, { status: 422 });
  }

  if (!pageContent?.trim()) {
    return NextResponse.json(
      { error: "Could not retrieve content from this URL. Try pasting the recipe manually." },
      { status: 422 }
    );
  }

  // Instagram CDN URLs expire within seconds — re-fetching at save time silently fails.
  // Upload now so the parse response contains a stable Supabase URL.
  let imageUrl = rawImageUrl;
  let imageCandidates = rawImageCandidates;
  if (rawImageUrl && (rawImageUrl.includes("cdninstagram.com") || rawImageUrl.includes("fbcdn.net"))) {
    const cached = await cacheInstagramImage(rawImageUrl, user.id, supabase);
    if (cached) {
      imageUrl = cached;
      imageCandidates = [cached, ...rawImageCandidates.slice(1)];
    }
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // For Instagram captions (incl. reels) and TikTok the spoken/written recipe
  // is often thin — short videos in particular don't narrate ingredients. Adding
  // the cover-frame as a multimodal input lets Gemini infer dish type, season,
  // plating, and visible ingredients from the photo. Cheapest meaningful boost.
  const inlineImage =
    (parsedVia === "instagram_caption" || parsedVia === "tiktok") && imageUrl
      ? await fetchInlineImage(imageUrl)
      : null;
  const usedMultimodal = !!inlineImage;

  const promptText = buildRecipePrompt(parsedVia, pageContent, imageUrl, usedMultimodal);
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: promptText },
  ];
  if (inlineImage) {
    parts.push({ inlineData: { mimeType: inlineImage.mimeType, data: inlineImage.data } });
  }

  const t0 = Date.now();
  const result = await model.generateContent(parts);
  const duration = Date.now() - t0;
  const operationLabel = (
    usedMultimodal ? `parse_link:${parsedVia}+image` : `parse_link:${parsedVia}`
  ) as `parse_link:${string}`;

  const rawText = result.response.text();

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const parsed = JSON.parse(jsonMatch[0]);

    // Perplexity-route results sometimes pass the upstream length check but
    // contain only a vague summary that the conservative prompt correctly
    // rejects (name=null + empty arrays). Returning that as success leaves
    // the user with a blank form — surface it as an explicit failure instead.
    const isPerplexityRoute =
      parsedVia === "youtube_perplexity" ||
      parsedVia === "instagram_perplexity" ||
      parsedVia === "perplexity";
    const hasNoRecipeContent =
      !parsed.name &&
      (!Array.isArray(parsed.ingredients) || parsed.ingredients.length === 0) &&
      (!Array.isArray(parsed.steps) || parsed.steps.length === 0);
    if (isPerplexityRoute && hasNoRecipeContent) {
      await logAIUsage({
        userId: user.id,
        operation: operationLabel,
        model: "gemini-2.5-flash",
        inputTokens: result.response.usageMetadata?.promptTokenCount ?? null,
        outputTokens: result.response.usageMetadata?.candidatesTokenCount ?? null,
        durationMs: duration,
        success: false,
      });
      return NextResponse.json(
        {
          error:
            "Could not extract a recipe from this URL. Web search returned only a summary, not the actual recipe. Try pasting it manually.",
        },
        { status: 422 }
      );
    }

    if (!parsed.image_url && imageUrl) {
      parsed.image_url = imageUrl;
    }
    parsed.image_candidates = imageCandidates;
    parsed.parsed_via = parsedVia;
    parsed.image_source = imageSource;
    await logAIUsage({
      userId: user.id,
      operation: operationLabel,
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
      operation: operationLabel,
      model: "gemini-2.5-flash",
      inputTokens: result.response.usageMetadata?.promptTokenCount ?? null,
      outputTokens: result.response.usageMetadata?.candidatesTokenCount ?? null,
      durationMs: duration,
      success: false,
    });
    return NextResponse.json(
      { error: "Could not parse recipe from this URL. Try pasting the recipe manually." },
      { status: 422 }
    );
  }
}
