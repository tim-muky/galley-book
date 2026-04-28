import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isSafeUrlAsync } from "@/lib/utils/url-validation";
import { fetchAuthor } from "@/lib/oembed";
import { logger } from "@/lib/logger";
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
      const author = await fetchAuthor("instagram", url);
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
      const author = await fetchAuthor("youtube", url);
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
      const author = await fetchAuthor("tiktok", url);
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

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const galleyId = searchParams.get("galleyId");
  const cursor = searchParams.get("cursor");
  const filter = searchParams.get("filter") ?? "";
  const search = searchParams.get("search") ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);

  if (!galleyId) return NextResponse.json({ error: "galleyId required" }, { status: 400 });

  let query = supabase
    .from("recipes")
    .select("*, recipe_photos(*)")
    .eq("galley_id", galleyId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt("updated_at", cursor);
  if (filter === "quick") query = query.lte("prep_time", 30);
  else if (["starter", "main", "dessert", "breakfast", "snack", "drink", "side"].includes(filter))
    query = query.eq("type", filter);
  if (search) query = query.ilike("name", `%${search}%`);

  const { data: recipes } = await query;
  const hasMore = (recipes?.length ?? 0) > limit;
  const items = hasMore ? recipes!.slice(0, limit) : (recipes ?? []);

  const recipeIds = items.map((r) => r.id);
  const { data: cookNextRows } = recipeIds.length > 0
    ? await supabase.from("cook_next_list").select("recipe_id").eq("galley_id", galleyId).in("recipe_id", recipeIds)
    : { data: [] };
  const cookNextIds = (cookNextRows ?? []).map((r) => r.recipe_id);

  return NextResponse.json({ recipes: items, hasMore, cookNextIds });
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

  const validIngredients = ingredients
    .filter((ing) => ing.name.trim())
    .map((ing, idx) => ({
      name: ing.name.trim(),
      amount: ing.amount != null && ing.amount !== "" ? String(ing.amount) : null,
      unit: ing.unit || null,
      group_name: ing.group || null,
      sort_order: idx,
    }));

  const validSteps = steps
    .filter((s) => s.instruction.trim())
    .map((s, idx) => ({
      step_number: idx + 1,
      instruction: s.instruction.trim(),
    }));

  // Single atomic RPC: recipe + ingredients + steps in one transaction.
  const { data: newRecipeId, error: rpcError } = await supabase.rpc(
    "create_recipe_with_children",
    {
      p_recipe: {
        galley_id: resolvedGalleyId,
        name: name.trim(),
        description: description?.trim() || null,
        servings: servings != null ? String(servings) : null,
        prep_time: prep_time != null ? String(prep_time) : null,
        season: season || "all_year",
        type: type || null,
        source_url: source_url?.trim() || null,
      },
      p_ingredients: validIngredients,
      p_steps: validSteps,
    }
  );

  if (rpcError || !newRecipeId) {
    logger.error("recipe_create_rpc_failed", {
      userId: user.id,
      galleyId: resolvedGalleyId,
      error: rpcError?.message ?? "no id returned",
    });
    return NextResponse.json({ error: "Failed to save recipe. Please try again." }, { status: 500 });
  }

  const recipeId = newRecipeId as string;
  const extractedSource = source_url?.trim() ? await extractSource(source_url.trim()) : null;

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

  // Download & store recipe image if provided (SSRF-safe: validated + DNS-checked).
  // Best-effort — recipe row is already committed. Failures are logged so we can monitor.
  if (image_url && (await isSafeUrlAsync(image_url))) {
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

      if (!imgRes.ok) {
        logger.warn("recipe_image_fetch_failed", {
          recipeId,
          status: imgRes.status,
          imageUrl: image_url,
        });
      } else {
        const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
        const ext = contentType.includes("png")
          ? "png"
          : contentType.includes("webp")
          ? "webp"
          : "jpg";
        const storagePath = `${recipeId}/primary.${ext}`;
        const imgBuffer = await imgRes.arrayBuffer();

        const { error: uploadError } = await supabase.storage
          .from("recipe-photos")
          .upload(storagePath, imgBuffer, { contentType, upsert: true });

        if (uploadError) {
          logger.warn("recipe_image_upload_failed", {
            recipeId,
            storagePath,
            error: uploadError.message,
          });
        } else {
          const { error: photoRowError } = await supabase.from("recipe_photos").insert({
            recipe_id: recipeId,
            storage_path: storagePath,
            is_primary: true,
            sort_order: 0,
          });
          if (photoRowError) {
            logger.warn("recipe_photo_row_insert_failed", {
              recipeId,
              storagePath,
              error: photoRowError.message,
            });
          }
        }
      }
    } catch (err) {
      logger.warn("recipe_image_fetch_threw", {
        recipeId,
        imageUrl: image_url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ id: recipeId }, { status: 201 });
}
