/**
 * POST /api/cook-next/vote
 * Body: { recipeId, vote: 1 | -1 }
 * Records the vote. If thumbs down (-1), returns a replacement recipe.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { resolveActiveGalleyId } from "@/lib/active-galley";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { recipeId, vote, currentIds } = await request.json();
  if (!recipeId || ![1, -1].includes(vote)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const galleyId = await resolveActiveGalleyId(supabase, user.id);
  if (!galleyId) return NextResponse.json({ error: "No galley" }, { status: 400 });

  // Record vote
  await supabase
    .from("cook_next_history")
    .update({ vote })
    .eq("recipe_id", recipeId)
    .eq("galley_id", galleyId);

  // If thumbs down, fetch a replacement
  if (vote === -1) {
    const exclude = [...(currentIds ?? []), recipeId].join(",");
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL}/api/cook-next?exclude=${exclude}`,
      { headers: { cookie: request.headers.get("cookie") ?? "" } }
    );
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ replacement: data.recipes?.[0] ?? null });
    }
  }

  return NextResponse.json({ ok: true });
}
