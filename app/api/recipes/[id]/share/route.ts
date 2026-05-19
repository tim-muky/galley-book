import { createClient } from "@/lib/supabase/server";
import { createShareToken } from "@/lib/share/token";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";

// GAL-336: create a signed share token tied to this recipe + a 48h expiry.
// Caller must be authenticated and a member of the recipe's galley.

const PUBLIC_HOST =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://galleybook.com";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: recipeId } = await context.params;

  // RLS ensures the user can only see recipes in galleys they're a member of.
  const { data: recipe, error } = await supabase
    .from("recipes")
    .select("id, galley_id")
    .eq("id", recipeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  const { token, expiresAt } = createShareToken(recipeId);
  const url = `${PUBLIC_HOST.replace(/\/$/, "")}/r/${recipeId}?t=${token}`;

  logger.info("share.token.created", {
    userId: user.id,
    recipeId,
    galleyId: recipe.galley_id,
    expiresAt,
  });

  return NextResponse.json({ url, expiresAt, token });
}
