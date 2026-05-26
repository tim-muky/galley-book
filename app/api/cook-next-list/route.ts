import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { resolveActiveGalleyId } from "@/lib/active-galley";
import { sendPushToGalleyMembers } from "@/lib/push/send";

// GAL-330: cook-next clear is noisy if it fires on every removal. The
// "clear" notification fires once when the list transitions non-empty
// → empty (DELETE endpoint). Per-item removal does not notify; only
// the explicit clear-all path does.

// GET /api/cook-next-list — returns all recipes in the galley's list (newest first).
// Each item includes the adder's name/email/avatar (joined separately because
// cook_next_list.added_by FKs into auth.users, not public.users — see GAL-233).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const galleyId = await resolveActiveGalleyId(supabase, user.id);
  if (!galleyId) return NextResponse.json({ items: [] });

  const { data } = await supabase
    .from("cook_next_list")
    .select(`id, recipe_id, added_at, added_by, recipes(id, name, prep_time, servings, type, recipe_photos(*))`)
    .eq("galley_id", galleyId)
    .order("added_at", { ascending: false })
    .limit(50);

  const ids = Array.from(
    new Set(((data ?? []) as Array<{ added_by: string | null }>).map((r) => r.added_by).filter((v): v is string => !!v))
  );
  const userMap = new Map<string, { name: string | null; email: string | null; avatar_url: string | null }>();
  if (ids.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, name, email, avatar_url")
      .in("id", ids);
    for (const u of users ?? []) {
      userMap.set(u.id as string, {
        name: (u as { name: string | null }).name ?? null,
        email: (u as { email: string | null }).email ?? null,
        avatar_url: (u as { avatar_url: string | null }).avatar_url ?? null,
      });
    }
  }

  const items = ((data ?? []) as Array<Record<string, unknown> & { added_by: string | null; recipes: unknown }>)
    .filter((row) => row.recipes != null)
    .map((row) => {
      const u = row.added_by ? userMap.get(row.added_by) ?? null : null;
      return {
        ...row,
        addedByName: u?.name ?? null,
        addedByEmail: u?.email ?? null,
        addedByAvatar: u?.avatar_url ?? null,
      };
    });

  return NextResponse.json({ items });
}

// POST /api/cook-next-list — add a recipe { recipeId }
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const galleyId = await resolveActiveGalleyId(supabase, user.id);
  if (!galleyId) return NextResponse.json({ error: "No galley" }, { status: 400 });

  const { recipeId } = await request.json();
  if (!recipeId) return NextResponse.json({ error: "recipeId required" }, { status: 400 });

  const { error } = await supabase
    .from("cook_next_list")
    .insert({ galley_id: galleyId, recipe_id: recipeId, added_by: user.id });

  // Ignore unique-constraint violation (already in list)
  if (error && !error.message.includes("unique")) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // GAL-330: notify other galley members that a recipe was added to cook-next.
  // Only fires when the insert actually happened (not on a duplicate skip),
  // so we re-check by reading the recipe name lazily.
  if (!error) {
    const { data: recipe } = await supabase
      .from("recipes")
      .select("name")
      .eq("id", recipeId)
      .maybeSingle();
    void sendPushToGalleyMembers(galleyId, user.id, {
      eventType: "cook_next_added",
      title: "Cook next updated",
      body: recipe?.name
        ? `${recipe.name} was added to Cook Next.`
        : "A recipe was added to Cook Next.",
      data: { screen: "cook_next" },
    });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE /api/cook-next-list — clear all recipes from the list
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const galleyId = await resolveActiveGalleyId(supabase, user.id);
  if (!galleyId) return NextResponse.json({ ok: true });

  // Check whether anything was in the list before clearing — only notify
  // when we actually transitioned non-empty → empty.
  const { count: beforeCount } = await supabase
    .from("cook_next_list")
    .select("id", { count: "exact", head: true })
    .eq("galley_id", galleyId);

  await supabase.from("cook_next_list").delete().eq("galley_id", galleyId);

  if ((beforeCount ?? 0) > 0) {
    void sendPushToGalleyMembers(galleyId, user.id, {
      eventType: "cook_next_cleared",
      title: "Cook Next cleared",
      body: "The Cook Next list was cleared.",
      data: { screen: "cook_next" },
    });
  }

  return NextResponse.json({ ok: true });
}
