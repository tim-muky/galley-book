import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const SourceCreateSchema = z.object({
  url: z.string().min(1).max(2000),
  sourceType: z.enum(["instagram", "youtube", "tiktok", "website"]),
  galleyId: z.string().uuid(),
});

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = SourceCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  const { url, sourceType, galleyId } = parsed.data;

  // Extract a display name from the URL
  let handleOrName: string | null = null;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (sourceType === "instagram") {
      handleOrName = parsed.pathname.replace(/^\//, "@").split("/")[0];
    } else if (sourceType === "youtube") {
      handleOrName = parsed.pathname.replace(/^\/@/, "@").split("/")[0];
    } else if (sourceType === "tiktok") {
      handleOrName = parsed.pathname.replace(/^\//, "").replace(/^@/, "@").split("/")[0] || "tiktok.com";
      if (!handleOrName.startsWith("@")) handleOrName = `@${handleOrName}`;
    } else {
      handleOrName = parsed.hostname;
    }
  } catch {
    handleOrName = url;
  }

  const { data: source, error } = await supabase
    .from("saved_sources")
    .insert({
      galley_id: galleyId,
      added_by: user.id,
      url: url.trim(),
      source_type: sourceType,
      handle_or_name: handleOrName,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ source }, { status: 201 });
}
