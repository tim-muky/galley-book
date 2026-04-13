import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { SettingsClient } from "./settings-client";
import type { UserProfile, SavedSource } from "@/types/database";

interface DeletedRecipe {
  id: string;
  name: string;
  deleted_at: string;
}

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Profile + memberships in parallel — neither depends on the other
  const [{ data: profileRaw }, { data: membershipsRaw }] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).single(),
    supabase
      .from("galley_members")
      .select("galley_id, role, galleys(id, name)")
      .eq("user_id", user.id)
      .order("invited_at", { ascending: true }),
  ]);

  const profile = profileRaw as unknown as UserProfile | null;
  const memberships = (membershipsRaw ?? []) as unknown as Array<{
    galley_id: string;
    role: string;
    galleys: { id: string; name: string } | null;
  }>;

  const galleyIds = memberships.map((m) => m.galley_id);

  // All three galley-dependent queries in parallel
  const [{ data: allMembersRaw }, { data: savedSourcesRaw }, { data: deletedRecipesRaw }] =
    galleyIds.length
      ? await Promise.all([
          supabase
            .from("galley_members")
            .select("galley_id, user_id, role, users(name, email, avatar_url)")
            .in("galley_id", galleyIds),
          supabase
            .from("saved_sources")
            .select("*")
            .in("galley_id", galleyIds)
            .order("created_at", { ascending: false }),
          supabase
            .from("recipes")
            .select("id, name, deleted_at")
            .in("galley_id", galleyIds)
            .not("deleted_at", "is", null)
            .order("deleted_at", { ascending: false }),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  const allMembers = (allMembersRaw ?? []) as unknown as Array<{
    galley_id: string;
    user_id: string;
    role: string;
    users: { name: string | null; email: string; avatar_url: string | null } | null;
  }>;
  const savedSources = (savedSourcesRaw ?? []) as unknown as SavedSource[];
  const deletedRecipes = (deletedRecipesRaw ?? []) as unknown as DeletedRecipe[];

  return (
    <SettingsClient
      profile={profile}
      memberships={memberships}
      allMembers={allMembers}
      savedSources={savedSources}
      deletedRecipes={deletedRecipes}
      currentUserId={user.id}
    />
  );
}
