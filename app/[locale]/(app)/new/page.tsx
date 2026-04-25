import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { NewRecipeClient } from "./new-recipe-client";
import { getLocale } from "next-intl/server";

export default async function NewRecipePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = await getLocale();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: membershipsRaw } = await supabase
    .from("galley_members")
    .select("galley_id, is_default, galleys(id, name)")
    .eq("user_id", user.id)
    .order("invited_at", { ascending: true });

  type MembershipRow = { galley_id: string; is_default: boolean; galleys: { id: string; name: string } | null };
  const galleys = ((membershipsRaw ?? []) as unknown as MembershipRow[]).map((m) => ({
    id: m.galley_id,
    name: m.galleys?.name ?? "Unnamed",
    isDefault: m.is_default,
  }));

  const defaultGalleyId = galleys.find((g) => g.isDefault)?.id ?? galleys[0]?.id ?? "";

  return <NewRecipeClient galleys={galleys} defaultGalleyId={defaultGalleyId} />;
}
