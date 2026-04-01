import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

  const contentType = file.type || "image/jpeg";
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const storagePath = `${id}/photo-${Date.now()}.${ext}`;

  const buffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("recipe-photos")
    .upload(storagePath, buffer, { contentType, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Mark all existing photos as non-primary, then insert new one as primary
  await supabase
    .from("recipe_photos")
    .update({ is_primary: false })
    .eq("recipe_id", id);

  await supabase.from("recipe_photos").insert({
    recipe_id: id,
    storage_path: storagePath,
    is_primary: true,
    sort_order: 0,
  });

  return NextResponse.json({ storagePath });
}
