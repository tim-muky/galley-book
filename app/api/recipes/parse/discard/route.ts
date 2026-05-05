import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { logParseQuality } from "@/lib/parse-quality-logger";
import type { ParsedVia } from "@/lib/recipe-prompts";

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    sourceUrl?: string | null;
    recipeName?: string | null;
    parsedVia?: ParsedVia | null;
  };

  await logParseQuality({
    userId: user.id,
    sourceUrl: body.sourceUrl?.trim() ? body.sourceUrl : null,
    parsedVia: body.parsedVia ?? null,
    success: false,
    errorMessage: "user_discarded",
    recipeName: body.recipeName ?? null,
    discarded: true,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
