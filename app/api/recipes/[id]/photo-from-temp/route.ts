import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";

// GAL-306: server-side copy from the private recipe-temp bucket to the
// permanent recipe-photos bucket. Used by the native save flow so the device
// never re-fetches the image (signed URLs expire, on-device fetch was
// unreliable in GAL-293's rollback).
//
// Body: { tempPath: string }
//
// Auth: requesting user must be a member of the recipe's galley (enforced
// implicitly — the SELECT on recipes uses the user's RLS session). The
// tempPath is also scoped to the user's own folder by the recipe-temp RLS
// policy (`storage.foldername(name)[1] = auth.uid()`), so we can't read
// another user's temp object even if we wanted to.

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const tempPath = body?.tempPath;
  if (!tempPath || typeof tempPath !== "string") {
    return NextResponse.json({ error: "tempPath required" }, { status: 400 });
  }
  if (!tempPath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Invalid tempPath" }, { status: 403 });
  }

  const { data: recipe } = await supabase
    .from("recipes")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!recipe) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from("recipe-temp")
    .download(tempPath);
  if (downloadError || !blob) {
    logger.warn("photo_from_temp_download_failed", {
      recipeId: id,
      tempPath,
      error: downloadError?.message,
    });
    return NextResponse.json(
      { error: "Temp image not found" },
      { status: 404 },
    );
  }

  const contentType = blob.type || "image/jpeg";
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
    ? "webp"
    : "jpg";
  const storagePath = `${id}/primary.${ext}`;
  const buffer = await blob.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("recipe-photos")
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (uploadError) {
    logger.error("photo_from_temp_upload_failed", {
      recipeId: id,
      storagePath,
      error: uploadError.message,
    });
    return NextResponse.json(
      { error: "Failed to store recipe photo" },
      { status: 500 },
    );
  }

  // Replace any existing primary row — same pattern as the photos route.
  await supabase
    .from("recipe_photos")
    .delete()
    .eq("recipe_id", id)
    .eq("is_primary", true);
  await supabase.from("recipe_photos").insert({
    recipe_id: id,
    storage_path: storagePath,
    is_primary: true,
    sort_order: 0,
  });

  // Best-effort cleanup; cron will catch leftovers anyway.
  await supabase.storage
    .from("recipe-temp")
    .remove([tempPath])
    .then(({ error }) => {
      if (error) {
        logger.warn("recipe_temp_cleanup_failed", {
          tempPath,
          error: error.message,
        });
      }
    });

  return NextResponse.json({ storagePath });
}
