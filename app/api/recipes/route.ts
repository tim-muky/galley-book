import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isSafeUrl } from "@/lib/utils/url-validation";
import { z } from "zod";

const IngredientSchema = z.object({
  name: z.string().min(1).max(200),
  amount: z.union([z.number().positive(), z.string()]).optional().nullable(),
  unit: z.string().max(50).optional().nullable(),
  group: z.string().max(100).optional().nullable(),
});

const StepSchema = z.object({
  instruction: z.string().min(1).max(3000),
});

const RecipeCreateSchema = z.object({
  name: z.string().min(1).max(300),
  description: z.string().max(2000).optional().nullable(),
  servings: z.number().int().min(1).max(100).optional().nullable(),
  prep_time: z.number().int().min(0).max(10080).optional().nullable(),
  season: z.enum(["spring", "summer", "autumn", "winter", "all_year"]).optional(),
  type: z.enum(["starter", "main", "dessert", "breakfast", "snack", "drink", "side"]).optional().nullable(),
  source_url: z.preprocess((v) => (v === "" ? null : v), z.string().url().max(4000).optional().nullable()),
  image_url: z.preprocess((v) => (v === "" ? null : v), z.string().url().max(4000).optional().nullable()),
  ingredients: z.array(IngredientSchema).max(100).default([]),
  steps: z.array(StepSchema).max(50).default([]),
  galleyId: z.string().uuid().optional().nullable(),
});

type SourceEntry = { sourceType: string; handleOrName: string; normalizedUrl: string };

/** Fetch author_name from Instagram oEmbed — works for public posts without auth */
async function instagramAuthor(url: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}&fields=author_name`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.author_name === "string" && data.author_name ? data.author_name : null;
  } catch {
    return null;
  }
}

/** Fetch author_name from YouTube oEmbed — works for all public videos */
async function youtubeAuthor(url: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.author_name === "string" && data.author_name ? data.author_name : null;
  } catch {
    return null;
  }
}

/** Fetch author info from TikTok oEmbed */
async function tiktokAuthor(url: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // author_url is like https://www.tiktok.com/@username
    const authorUrl: string = data.author_url ?? "";
    const handleMatch = authorUrl.match(/tiktok\.com\/@([^/?#]+)/);
    if (handleMatch?.[1]) return `@${handleMatch[1]}`;
    return typeof data.author_name === "string" && data.author_name ? data.author_name : null;
  } catch {
    return null;
  }
}

/** Extract a normalised source entry from a recipe URL to auto-populate saved_sources */
async function extractSource(url: string): Promise<SourceEntry | null> {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace("www.", "");

    if (hostname.includes("instagram.com")) {
      // Try to get account from the URL path first (profile URLs: /username)
      const accountMatch = url.match(/instagram\.com\/([A-Za-z0-9_.]+)\/?(?:[?#]|$)/);
      const account = accountMatch?.[1];
      if (account && !["p", "reel", "tv", "stories", "explore"].includes(account)) {
        return { sourceType: "instagram", handleOrName: `@${account}`, normalizedUrl: `https://instagram.com/${account}` };
      }
      // Post/reel URL — fetch author via oEmbed
      const author = await instagramAuthor(url);
      if (author) {
        return { sourceType: "instagram", handleOrName: `@${author}`, normalizedUrl: `https://instagram.com/${author}` };
      }
      return { sourceType: "instagram", handleOrName: "instagram.com", normalizedUrl: "https://instagram.com" };
    }

    if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
      // Try channel/handle from URL first (channel pages: /channel/, /c/, /@)
      const channelMatch = url.match(/youtube\.com\/(?:channel\/|c\/|@)([^/?#]+)/);
      const handle = channelMatch?.[1];
      if (handle) {
        return { sourceType: "youtube", handleOrName: `@${handle}`, normalizedUrl: `https://youtube.com/@${handle}` };
      }
      // Video URL — fetch channel name via oEmbed
      const author = await youtubeAuthor(url);
      if (author) {
        return { sourceType: "youtube", handleOrName: author, normalizedUrl: `https://youtube.com` };
      }
      return { sourceType: "youtube", handleOrName: "youtube.com", normalizedUrl: "https://youtube.com" };
    }

    if (hostname.includes("tiktok.com")) {
      // Try @handle from URL first
      const accountMatch = url.match(/tiktok\.com\/@([^/?#]+)/);
      const account = accountMatch?.[1];
      if (account) {
        return { sourceType: "tiktok", handleOrName: `@${account}`, normalizedUrl: `https://tiktok.com/@${account}` };
      }
      // Fetch via oEmbed
      const author = await tiktokAuthor(url);
      if (author) {
        const handle = author.startsWith("@") ? author.slice(1) : author;
        return { sourceType: "tiktok", handleOrName: author, normalizedUrl: `https://tiktok.com/@${handle}` };
      }
      return { sourceType: "tiktok", handleOrName: "tiktok.com", normalizedUrl: "https://tiktok.com" };
    }

    return { sourceType: "website", handleOrName: hostname, normalizedUrl: `https://${hostname}` };
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
  const parsed = RecipeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  const { name, description, servings, prep_time, season, type, source_url, image_url, ingredients, steps, galleyId: explicitGalleyId } = parsed.data;

  // Resolve galley: explicit selection → default → oldest
  let resolvedGalleyId: string;
  if (explicitGalleyId) {
    const { data: m } = await supabase
      .from("galley_members")
      .select("galley_id")
      .eq("galley_id", explicitGalleyId)
      .eq("user_id", user.id)
      .single();
    if (!m) return NextResponse.json({ error: "No galley found" }, { status: 400 });
    resolvedGalleyId = explicitGalleyId;
  } else {
    const { data: defaultM } = await supabase
      .from("galley_members")
      .select("galley_id")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .single();
    if (defaultM) {
      resolvedGalleyId = defaultM.galley_id;
    } else {
      const { data: fallback } = await supabase
        .from("galley_members")
        .select("galley_id")
        .eq("user_id", user.id)
        .order("invited_at", { ascending: true })
        .limit(1)
        .single();
      if (!fallback) return NextResponse.json({ error: "No galley found" }, { status: 400 });
      resolvedGalleyId = fallback.galley_id;
    }
  }

  // Create recipe
  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .insert({
      galley_id: resolvedGalleyId,
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

  // Build insert payloads
  const validIngredients = ingredients
    .filter((ing) => ing.name.trim())
    .map((ing, idx) => ({
      recipe_id: recipe.id,
      name: ing.name.trim(),
      amount: ing.amount ? Number(ing.amount) : null,
      unit: ing.unit || null,
      group_name: ing.group || null,
      sort_order: idx,
    }));

  const validSteps = steps
    .filter((s) => s.instruction.trim())
    .map((s, idx) => ({
      recipe_id: recipe.id,
      step_number: idx + 1,
      instruction: s.instruction.trim(),
    }));

  const extractedSource = source_url?.trim() ? await extractSource(source_url.trim()) : null;

  // Insert ingredients + steps in parallel — rollback recipe on any failure
  const [{ error: ingError }, { error: stepError }] = await Promise.all([
    validIngredients.length > 0
      ? supabase.from("ingredients").insert(validIngredients)
      : Promise.resolve({ error: null }),
    validSteps.length > 0
      ? supabase.from("preparation_steps").insert(validSteps)
      : Promise.resolve({ error: null }),
  ]);

  if (ingError || stepError) {
    await supabase.from("recipes").delete().eq("id", recipe.id);
    return NextResponse.json({ error: "Failed to save recipe. Please try again." }, { status: 500 });
  }

  // Source upsert — non-critical, don't rollback on failure
  if (extractedSource) {
    await supabase.from("saved_sources").upsert(
      {
        galley_id: resolvedGalleyId,
        added_by: user.id,
        url: extractedSource.normalizedUrl,
        source_type: extractedSource.sourceType,
        handle_or_name: extractedSource.handleOrName,
      },
      { onConflict: "galley_id,url", ignoreDuplicates: true }
    );
  }

  // Download & store recipe image if provided (SSRF-safe: validated before fetch)
  if (image_url && isSafeUrl(image_url)) {
    try {
      const isInstagramCdn =
        image_url.includes("cdninstagram.com") || image_url.includes("fbcdn.net");
      const imgRes = await fetch(image_url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; GalleyBook/1.0; +https://galleybook.com)",
          ...(isInstagramCdn ? { Referer: "https://www.instagram.com/" } : {}),
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
