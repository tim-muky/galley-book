/**
 * POST /api/bring
 *
 * Generates a Bring! shopping list deeplink for a recipe.
 *
 * Flow:
 * 1. Look up the recipe's share_token.
 * 2. Construct the public share URL (app.galleybook.com/share/<token>).
 * 3. Call Bring!'s deeplink API with that URL. Retry once on 5xx.
 * 4. Return the OneLink-style `https://getbring.onelink.me/...` deeplink.
 *    On iOS this universal link opens the Bring app directly, falling back
 *    to the App Store install page when Bring isn't installed.
 *
 * If Bring's API is unavailable, we surface a 502 to the client. We never
 * return an `api.getbring.com` GET URL as a "deeplink" — that opens Safari
 * to the API endpoint, not the Bring app, and frequently 500s.
 *
 * The share page at /share/[token] has Schema.org Recipe microdata which
 * Bring's parser uses to extract ingredients automatically.
 */

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";

const BRING_API = "https://api.getbring.com/rest/bringrecipes/deeplink";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.galleybook.com";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { recipeId, requestedQuantity = 4, baseQuantity = 4 } = await request.json();

  if (!recipeId) {
    return NextResponse.json({ error: "recipeId is required" }, { status: 400 });
  }

  const { data: recipe } = await supabase
    .from("recipes")
    .select("share_token, servings")
    .eq("id", recipeId)
    .single();

  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  const shareUrl = `${APP_URL}/share/${recipe.share_token}`;
  const body = JSON.stringify({
    url: shareUrl,
    source: "app",
    baseQuantity: baseQuantity ?? recipe.servings ?? 4,
    requestedQuantity: requestedQuantity ?? recipe.servings ?? 4,
  });

  for (let attempt = 1; attempt <= 2; attempt++) {
    const bringRes = await fetch(BRING_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(8000),
    }).catch((err) => {
      logger.warn("bring_fetch_threw", {
        recipeId,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    });

    if (bringRes?.ok) {
      const { deeplink } = (await bringRes.json()) as { deeplink?: string };
      if (deeplink) return NextResponse.json({ deeplink });
      logger.warn("bring_response_missing_deeplink", { recipeId, attempt });
    } else if (bringRes) {
      logger.warn("bring_api_non_ok", {
        recipeId,
        attempt,
        status: bringRes.status,
      });
      // Don't retry on 4xx — that's a request shape problem, not transient.
      if (bringRes.status >= 400 && bringRes.status < 500) break;
    }
  }

  return NextResponse.json(
    { error: "Bring! is unavailable right now. Please try again in a moment." },
    { status: 502 }
  );
}
