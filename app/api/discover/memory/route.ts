/**
 * POST /api/discover/memory
 * Body: { url, title }
 * Adds a rejected discover result to the memory table.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url, title } = await request.json();
  if (!url) return NextResponse.json({ error: "URL required" }, { status: 400 });

  const { data: membership } = await supabase
    .from("galley_members")
    .select("galley_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return NextResponse.json({ error: "No galley" }, { status: 400 });

  await supabase
    .from("discover_memory")
    .upsert({ galley_id: membership.galley_id, url, title }, { onConflict: "galley_id,url" });

  return NextResponse.json({ ok: true });
}
