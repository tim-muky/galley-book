import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { CookNextClient } from "./cook-next-client";
import { getLocale } from "next-intl/server";

export default async function CookNextPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = await getLocale();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: membership } = await supabase
    .from("galley_members")
    .select("galley_id, galleys(name)")
    .eq("user_id", user.id)
    .order("invited_at", { ascending: true })
    .limit(1)
    .single();

  if (!membership?.galley_id) {
    return <CookNextClient initialItems={[]} galleyName="" memberNames={{}} />;
  }

  const galleyName = (membership.galleys as unknown as { name: string } | null)?.name ?? "";

  const { data: items } = await supabase
    .from("cook_next_list")
    .select(`id, recipe_id, added_by, added_at, recipes(id, name, prep_time, servings, type, recipe_photos(*))`)
    .eq("galley_id", membership.galley_id)
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
