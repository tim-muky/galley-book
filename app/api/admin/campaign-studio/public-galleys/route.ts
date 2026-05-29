import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

/** Search public galleys for the Campaign Studio import flow (GAL-401). */
export async function GET(request: Request) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  const service = createServiceClient();

  let query = service
    .from("galleys")
    .select("id, name, recipes(count)")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(50);
  if (q) query = query.ilike("name", `%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const galleys = (data ?? []).map((g) => ({
    id: g.id as string,
    name: g.name as string,
    recipeCount:
      (g.recipes as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
  return NextResponse.json({ galleys });
}
