import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { SettingsClient } from "./settings-client";
import type { UserProfile, SavedSource } from "@/types/database";

interface DeletedRecipe {
  id: string;
  name: string;
  deleted_at: string;
}

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const [{ data: profileRaw }, { data: membershipsRaw }] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).single(),
    supabase
      .from("galley_members")
      .select("galley_id, role, is_default, galleys(id, name, header_image_path)")
      .eq("user_id", user.id)
      .order("invited_at", { ascending: true }),
  ]);

  const profile = profileRaw as unknown as UserProfile | null;
  const memberships = (membershipsRaw ?? []) as unknown as Array<{
    galley_id: string;
    role: string;
    is_default: boolean;
    galleys: { id: string; name: string; header_image_path: string | null } | null;
  }>;

  const galleyIds = memberships.map((m) => m.galley_id);

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
    users: { name: string | null; email: string | null; avatar_url: string | null } | null;
  }>;

  const membersNeedingFallback = allMembers.filter(
    (m) => !m.users || (!m.users.name && !m.users.email)
  );
  if (membersNeedingFallback.length > 0) {
    const serviceClient = createServiceClient();
    await Promise.all(
      membersNeedingFallback.map(async (m) => {
        const { data } = await serviceClient.auth.admin.getUserById(m.user_id);
        if (data?.user) {
          m.users = {
            name: (data.user.user_metadata?.full_name as string | null) ?? null,
            email: data.user.email ?? null,
            avatar_url: (data.user.user_metadata?.avatar_url as string | null) ?? null,
          };
        }
      })
    );
  }

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
      translationLanguage={profile?.translation_language ?? null}
      currentLocale={locale}
    />
  );
}
