import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { CookNextClient } from "./cook-next-client";
import { getLocale } from "next-intl/server";
import { resolveActiveGalleyId } from "@/lib/active-galley";

export default async function CookNextPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = await getLocale();
  if (!user) redirect(`/${locale}/auth/login`);

  const galleyId = await resolveActiveGalleyId(supabase, user.id);

  if (!galleyId) {
    return <CookNextClient initialItems={[]} galleyName="" memberNames={{}} />;
  }

  const { data: galleyRow } = await supabase
    .from("galleys")
    .select("name")
    .eq("id", galleyId)
    .single();
  const galleyName = galleyRow?.name ?? "";

  const { data: items } = await supabase
    .from("cook_next_list")
    .select(`id, recipe_id, added_by, added_at, recipes(id, name, prep_time, servings, type, recipe_photos(*))`)
    .eq("galley_id", galleyId)
    .order("added_at", { ascending: false });

  const addedByIds = [...new Set((items ?? []).map((i) => i.added_by).filter(Boolean))];
  const memberNames: Record<string, string> = {};
  if (addedByIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, name")
      .in("id", addedByIds);
    for (const u of users ?? []) {
      if (u.name) memberNames[u.id] = u.name;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <CookNextClient initialItems={(items ?? []) as any} galleyName={galleyName} memberNames={memberNames} />;
}
