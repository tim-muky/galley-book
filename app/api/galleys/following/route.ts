import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GAL-334: list the public galleys the current user is following.
// Used by the Settings → Following section for unfollowing.

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: rows, error } = await supabase
    .from("galley_followers")
    .select(
      `followed_at, galley:galleys!inner(id, name, owner_id, is_public, header_image_path)`,
    )
    .eq("user_id", user.id)
    .order("followed_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // PostgREST types embedded foreign-key joins as arrays even when the
  // join is logically to-one. The actual runtime shape is a single object
  // (or null), so flatten via [].concat. Cast through unknown to satisfy
  // the type checker.
  type FollowingRow = {
    followed_at: string;
    galley: {
      id: string;
      name: string;
      owner_id: string;
      is_public: boolean;
      header_image_path: string | null;
    } | { id: string; name: string; owner_id: string; is_public: boolean; header_image_path: string | null }[] | null;
  };
  function single<T>(v: T | T[] | null | undefined): T | null {
    if (!v) return null;
    return Array.isArray(v) ? v[0] ?? null : v;
  }

  const typedRows = (rows ?? []) as unknown as FollowingRow[];

  const ownerIds = Array.from(
    new Set(
      typedRows
        .map((r) => single(r.galley)?.owner_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const ownerMap = new Map<string, string | null>();
  if (ownerIds.length > 0) {
    const { data: owners } = await supabase
      .from("users")
      .select("id, name")
      .in("id", ownerIds);
    for (const o of owners ?? []) {
      ownerMap.set(o.id as string, (o as { name: string | null }).name ?? null);
    }
  }

  const items = typedRows.map((row) => {
    const galley = single(row.galley);
    if (!galley) return null;
    return {
      galleyId: galley.id,
      name: galley.name,
      ownerName: ownerMap.get(galley.owner_id) ?? null,
      isPublic: galley.is_public,
      headerImagePath: galley.header_image_path,
      followedAt: row.followed_at,
    };
  });

  return NextResponse.json({
    items: items.filter((v): v is NonNullable<typeof v> => v !== null),
  });
}
