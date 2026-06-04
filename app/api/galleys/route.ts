import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GAL-17 + GAL-278 + 2026-05-06 product rule:
// Default recipes only land in a user's FIRST galley, which is created
// automatically by the `handle_new_user` Postgres trigger and seeded there
// via `seed_default_recipes` (migration 031). This route now handles
// galley #2+ only — no seeding, no exception.

// GAL-416: list the requesting user's galleys, earliest membership first.
// The iOS Share Extension calls this to resolve a galleyId for its
// entitlement check (GET /api/iap/status?galleyId=…); without a GET handler
// the request 405'd, the extension got no galley, and every share showed a
// false "Upgrade required" even for subscribers.
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("galley_members")
    .select("galley_id, is_default, galleys(name)")
    .eq("user_id", user.id)
    .order("invited_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const galleys = (data ?? []).map((row) => {
    const g = Array.isArray(row.galleys) ? row.galleys[0] : row.galleys;
    return {
      id: row.galley_id,
      name: (g as { name?: string } | null)?.name ?? "Untitled",
      is_default: row.is_default,
    };
  });

  return NextResponse.json({ galleys });
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Support both JSON and form data
  const contentType = request.headers.get("content-type") ?? "";
  let name: string;

  if (contentType.includes("application/json")) {
    const body = await request.json();
    name = body.name;
  } else {
    const form = await request.formData();
    name = form.get("name") as string;
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const trimmedName = name.trim();

  const { data: existing } = await supabase
    .from("galleys")
    .select("id")
    .eq("owner_id", user.id)
    .ilike("name", trimmedName)
    .limit(1)
    .maybeSingle();

  let galleyId: string;

  if (existing) {
    galleyId = existing.id;
  } else {
    const { data, error } = await supabase
      .rpc("create_galley", { galley_name: trimmedName, owner: user.id });

    if (error?.code === "23505") {
      const { data: raced } = await supabase
        .from("galleys")
        .select("id")
        .eq("owner_id", user.id)
        .ilike("name", trimmedName)
        .limit(1)
        .maybeSingle();
      if (!raced) {
        return NextResponse.json({ error: "Failed to create galley" }, { status: 500 });
      }
      galleyId = raced.id;
    } else if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Failed to create galley" }, { status: 500 });
    } else {
      galleyId = data as string;
    }
  }

  if (!contentType.includes("application/json")) {
    return new Response(null, { status: 303, headers: { Location: "/library" } });
  }

  return NextResponse.json({ id: galleyId }, { status: 201 });
}
