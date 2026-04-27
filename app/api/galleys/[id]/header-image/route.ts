import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import sharp from "sharp";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: galleyId } = await params;

  const { data: membership } = await supabase
    .from("galley_members")
    .select("role")
    .eq("galley_id", galleyId)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("image") as File | null;
  if (!file || !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const compressed = await sharp(Buffer.from(arrayBuffer))
    .resize(1200, 400, { fit: "cover", position: "center" })
    .jpeg({ quality: 85 })
    .toBuffer();

  const storagePath = `galley-headers/${galleyId}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("recipe-photos")
    .upload(storagePath, compressed, { contentType: "image/jpeg", upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  await supabase
    .from("galleys")
    .update({ header_image_path: storagePath } as never)
    .eq("id", galleyId);

  const { data: { publicUrl } } = supabase.storage
    .from("recipe-photos")
    .getPublicUrl(storagePath);

  return NextResponse.json({ path: storagePath, url: publicUrl });
}
