import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { CookNextClient } from "./cook-next-client";

export default async function CookNextPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: membership } = await supabase
    .from("galley_members")
    .select("galley_id")
    .eq("user_id", user.id)
    .order("invited_at", { ascending: true })
    .limit(1)
    .single();

  if (!membership?.galley_id) {
    return <CookNextClient initialItems={[]} />;
  }

  const { data: items } = await supabase
    .from("cook_next_list")
    .select(`id, recipe_id, added_at, recipes(id, name, prep_time, servings, type, recipe_photos(*))`)
    .eq("galley_id", membership.galley_id)
    .order("added_at", { ascending: false });

  // cast needed until cook_next_list is reflected in the generated DB types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <CookNextClient initialItems={(items ?? []) as any} />;
}
