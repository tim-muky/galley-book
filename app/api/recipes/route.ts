import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isSafeUrl } from "@/lib/utils/url-validation";

/** Extract a source entry from a recipe URL to auto-populate saved_sources */
function extractSource(url: string): { sourceType: string; handleOrName: string } | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace("www.", "");

    if (hostname.includes("instagram.com")) {
      // Try to get account from profile URL (not post URL)
      const accountMatch = url.match(/instagram\.com\/([^/?#p\s][^/?#\s]*)\/?(?!\bp\/\b)/);
      const account = accountMatch?.[1];
      if (account && !["p", "reel", "tv", "stories", "explore"].includes(account)) {
        return { sourceType: "instagram", handleOrName: `@${account}` };
      }
      return { sourceType: "instagram", handleOrName: "instagram.com" };
    }

    if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
      const channelMatch = url.match(/youtube\.com\/(?:channel\/|c\/|@)([^/?#]+)/);
      const handle = channelMatch?.[1];
      return { sourceType: "youtube", handleOrName: handle ? `@${handle}` : "youtube.com" };
    }

    return { sourceType: "website", handleOrName: hostname };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    name,
    description,
    servings,
    prep_time,
    season,
    type,
    source_url,
    image_url,
    ingredients = [],
    steps = [],
  } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Get user's galley
  const { data: membership } = await supabase
    .from("galley_members")
    .select("galley_id")
    .eq("user_id", user.id)
    .order("invited_at", { ascending: true })
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No galley found" }, { status: 400 });
  }

  // Create recipe
  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .insert({
      galley_id: membership.galley_id,
      created_by: user.id,
      name: name.trim(),
      description: description?.trim() || null,
      servings: servings ? Number(servings) : null,
      prep_time: prep_time ? Number(prep_time) : null,
      season: season || "all_year",
      type: type || null,
      source_url: source_url?.trim() || null,
    })
    .select()
    .single();

  if (recipeError || !recipe) {
    return NextResponse.json({ error: "Failed to create recipe" }, { status: 500 });
  }

  // Insert ingredients
  if (ingredients.length > 0) {
    const validIngredients = ingredients
      .filter((ing: { name?: string }) => ing.name?.trim())
      .map((ing: { name: string; amount?: string; unit?: string }, idx: number) => ({
        recipe_id: recipe.id,
        name: ing.name.trim(),
        amount: ing.amount ? Number(ing.amount) : null,
        unit: ing.unit || null,
        sort_order: idx,
      }));

    if (validIngredients.length > 0) {
      await supabase.from("ingredients").insert(validIngredients);
    }
  }

  // Insert steps
  if (steps.length > 0) {
    const validSteps = steps
      .filter((s: { instruction?: string }) => s.instruction?.trim())
      .map((s: { instruction: string }, idx: number) => ({
        recipe_id: recipe.id,
        step_number: idx + 1,
        instruction: s.instruction.trim(),
      }));

    if (validSteps.length > 0) {
      await supabase.from("preparation_steps").insert(validSteps);
    }
  }

  // Auto-save source from source_url
  if (source_url?.trim()) {
    const extracted = extractSource(source_url.trim());
    if (extracted) {
      await supabase.from("saved_sources").upsert(
        {
          galley_id: membership.galley_id,
          added_by: user.id,
          url: source_url.trim(),
          source_type: extracted.sourceType,
          handle_or_name: extracted.handleOrName,
        },
        { onConflict: "galley_id,url", ignoreDuplicates: true }
      );
    }
  }

  // Download & store recipe image if provided (SSRF-safe: validated before fetch)
  if (image_url && isSafeUrl(image_url)) {
    try {
      const imgRes = await fetch(image_url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; GalleyBook/1.0; +https://galleybook.com)",
        },
        signal: AbortSignal.timeout(12000),
      });

      if (imgRes.ok) {
        const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
        const ext = contentType.includes("png")
          ? "png"
          : contentType.includes("webp")
          ? "webp"
          : "jpg";
        const storagePath = `${recipe.id}/primary.${ext}`;
        const imgBuffer = await imgRes.arrayBuffer();

        const { error: uploadError } = await supabase.storage
          .from("recipe-photos")
          .upload(storagePath, imgBuffer, { contentType, upsert: true });

        if (!uploadError) {
          await supabase.from("recipe_photos").insert({
            recipe_id: recipe.id,
            storage_path: storagePath,
            is_primary: true,
            sort_order: 0,
          });
        }
      }
    } catch {
      // Image fetch failed — recipe is still saved, just without a photo
    }
  }

  return NextResponse.json({ id: recipe.id }, { status: 201 });
}
