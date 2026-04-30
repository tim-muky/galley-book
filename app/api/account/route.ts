/**
 * DELETE /api/account
 *
 * Permanently deletes the authenticated user's account and all their data.
 *
 * Deletion order:
 *  1. Identify galleys the user OWNS — their content will cascade-delete automatically
 *     when auth.deleteUser fires (auth.users → public.users → galleys → recipes/members/votes).
 *  2. For recipes in OTHER people's galleys: set created_by = NULL (anonymise attribution).
 *  3. For saved_sources in OTHER people's galleys: set added_by = NULL.
 *  4. Call supabase.auth.admin.deleteUser(userId) which triggers the full cascade.
 *
 * Prerequisite: migration 002_nullable_attribution.sql must be applied first
 * so that created_by and added_by accept NULL values.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = (await request.json()) as { name?: string };
  const trimmed = name?.trim();
  if (!trimmed) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (trimmed.length > 50) return NextResponse.json({ error: "Name too long" }, { status: 400 });

  const { error } = await supabase
    .from("users")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ name: trimmed } as any)
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE() {
  // 1. Verify the caller is authenticated
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;
  const service = createServiceClient();

  // 2. Find galleys this user owns
  //    (content in these galleys will cascade-delete automatically)
  const { data: ownedGalleys, error: galleryError } = await service
    .from("galleys")
    .select("id")
    .eq("owner_id", userId);

  if (galleryError) {
    return NextResponse.json({ error: galleryError.message }, { status: 500 });
  }

  const ownedGalleyIds = (ownedGalleys ?? []).map((g: { id: string }) => g.id);

  // 3. Anonymise recipe attributions in OTHER people's galleys
  if (ownedGalleyIds.length > 0) {
    const { error: recipeError } = await service
      .from("recipes")
      .update({ created_by: null })
      .eq("created_by", userId)
      .not("galley_id", "in", `(${ownedGalleyIds.join(",")})`);

    if (recipeError) {
      return NextResponse.json({ error: recipeError.message }, { status: 500 });
    }
  } else {
    // User owns no galleys — anonymise all their recipe attributions
    const { error: recipeError } = await service
      .from("recipes")
      .update({ created_by: null })
      .eq("created_by", userId);

    if (recipeError) {
      return NextResponse.json({ error: recipeError.message }, { status: 500 });
    }
  }

  // 4. Anonymise saved_sources attributions in OTHER people's galleys
  if (ownedGalleyIds.length > 0) {
    const { error: sourcesError } = await service
      .from("saved_sources")
      .update({ added_by: null })
      .eq("added_by", userId)
      .not("galley_id", "in", `(${ownedGalleyIds.join(",")})`);

    if (sourcesError) {
      return NextResponse.json({ error: sourcesError.message }, { status: 500 });
    }
  } else {
    const { error: sourcesError } = await service
      .from("saved_sources")
      .update({ added_by: null })
      .eq("added_by", userId);

    if (sourcesError) {
      return NextResponse.json({ error: sourcesError.message }, { status: 500 });
    }
  }

  // Null out attribution that doesn't have ON DELETE handling (defensive —
  // migration 021 should have covered this but a stale schema would
  // otherwise blow up the cascade).
  await service.from("recipe_translations").update({ translated_by: null }).eq("translated_by", userId);

  // 5. Delete the auth user — cascades to public.users → galleys → everything else
  const { error: deleteError } = await service.auth.admin.deleteUser(userId);

  if (deleteError) {
    console.error("[account/delete]", { userId, message: deleteError.message, status: deleteError.status });
    return NextResponse.json(
      { error: `${deleteError.message} (status ${deleteError.status ?? "unknown"})` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
