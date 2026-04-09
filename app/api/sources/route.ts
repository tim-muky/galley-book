import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url, sourceType, galleyId } = await request.json();

  if (!url?.trim() || !sourceType || !galleyId) {
    return NextResponse.json({ error: "url, sourceType and galleyId are required" }, { status: 400 });
  }

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
