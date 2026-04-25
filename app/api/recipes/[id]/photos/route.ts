import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import sharp from "sharp";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("photo") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // 10 MB hard limit — prevents DoS via oversized uploads
  const MAX_BYTES = 10 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Photo must be under 10 MB." }, { status: 413 });
  }

  // Content-type must be a real image (client-supplied, but filters obvious misuse)
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image." }, { status: 415 });
  }

  // RLS enforces galley membership — a missing row means no access
  const { data: recipe } = await supabase
    .from("recipes")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!recipe) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Always store as JPEG after resize — consistent format, ~80% smaller than raw phone photos
  const storagePath = `${id}/photo-${Date.now()}.jpg`;

  const raw = await file.arrayBuffer();
  const compressed = await sharp(Buffer.from(raw))
    .rotate() // honour EXIF orientation before resizing
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const { error: uploadError } = await supabase.storage
    .from("recipe-photos")
    .upload(storagePath, compressed, { contentType: "image/jpeg", upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Delete the existing primary photo row, then insert the new one.
  // An update (is_primary: false) can silently no-op under RLS, leaving two
  // primary rows and making the detail page show the old photo after upload.
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

  return NextResponse.json({ storagePath });
}
