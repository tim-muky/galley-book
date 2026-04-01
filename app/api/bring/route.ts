/**
 * POST /api/bring
 *
 * Generates a Bring! shopping list deeplink for a recipe.
 *
 * Flow:
 * 1. Look up the recipe's share_token
 * 2. Construct the public share URL (galleybook.com/share/<token>)
 * 3. Call Bring!'s deeplink API with that URL
 * 4. Return the deeplink to the client
 *
 * The share page at /share/[token] has Schema.org Recipe microdata,
 * which Bring!'s parser uses to extract ingredients automatically.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const BRING_API = "https://api.getbring.com/rest/bringrecipes/deeplink";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://galleybook.com";

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

  // Fetch the recipe's share_token
  const { data: recipe } = await supabase
    .from("recipes")
    .select("share_token, servings")
    .eq("id", recipeId)
    .single();

  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  const shareUrl = `${APP_URL}/share/${recipe.share_token}`;

  // Call Bring!'s deeplink API
  const bringRes = await fetch(BRING_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: shareUrl,
      source: "app",
      baseQuantity: baseQuantity ?? recipe.servings ?? 4,
      requestedQuantity: requestedQuantity ?? recipe.servings ?? 4,
    }),
  });

  if (!bringRes.ok) {
    // Bring! API failed — fall back to direct deeplink URL (GET method)
    const fallbackUrl = `${BRING_API}?url=${encodeURIComponent(shareUrl)}&source=web&baseQuantity=${baseQuantity}&requestedQuantity=${requestedQuantity}`;
    return NextResponse.json({ deeplink: fallbackUrl });
  }

  const { deeplink } = await bringRes.json();
  return NextResponse.json({ deeplink });
}
