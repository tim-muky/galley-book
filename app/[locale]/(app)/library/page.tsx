import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
export const dynamic = "force-dynamic";
import { Link } from "@/i18n/routing";
import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { GalleySwitcher } from "@/components/galley-switcher";
import { LibraryRecipes } from "./library-recipes-client";
import Image from "next/image";
import { resolveActiveGalleyId } from "@/lib/active-galley";
import { escapeLikePattern } from "@/lib/utils";
import { LibraryFilters } from "./library-filters-client";
import {
  parseTagFilters,
  resolveFilteredRecipeIds,
  loadAvailableTags,
} from "@/lib/recipe-filters";

const PAGE_SIZE = 20;

interface SearchParams {
  filter?: string;
  search?: string;
  quick?: string;
  cuisine?: string;
  type?: string;
  season?: string;
  ingredient?: string;
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const locale = await getLocale();
  const params = await searchParams;
  const t = await getTranslations("library");
  const tc = await getTranslations("common");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const [{ data: membershipsRaw }, { data: userRow }] = await Promise.all([
    supabase
      .from("galley_members")
      .select("galley_id, is_default, galleys(id, name)")
      .eq("user_id", user.id)
      .order("invited_at", { ascending: true }),
    supabase.from("users").select("name").eq("id", user.id).single(),
  ]);

  type MembershipRow = { galley_id: string; is_default: boolean; galleys: { id: string; name: string } | null };
  const memberships = (membershipsRaw ?? []) as unknown as MembershipRow[];

  const dbName = (userRow as { name: string | null } | null)?.name?.trim() ?? "";
  const metaName = ((user.user_metadata?.full_name as string | undefined) ?? "").trim();
  const hasName = !!dbName || !!metaName;

  if (!hasName || memberships.length === 0) {
    redirect(`/${locale}/onboarding`);
  }

  const galleyId = (await resolveActiveGalleyId(supabase, user.id))!;

  const tagFilters = parseTagFilters(params as Record<string, string | undefined>);
  const matchingRecipeIds = await resolveFilteredRecipeIds(supabase, galleyId, tagFilters);

  let recipesQuery = supabase
    .from("recipes")
    .select(`*, recipe_photos(*), recipe_tags(*)`)
    .eq("galley_id", galleyId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (tagFilters.quick) {
    recipesQuery = recipesQuery.lte("prep_time", 30);
  }
  if (matchingRecipeIds !== null) {
    if (matchingRecipeIds.length === 0) {
      recipesQuery = recipesQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      recipesQuery = recipesQuery.in("id", matchingRecipeIds);
    }
  }

  if (params.search) {
    recipesQuery = recipesQuery.ilike("name", `%${escapeLikePattern(params.search)}%`);
  }

  const galleyIds = memberships.map((m) => m.galley_id);

  const [{ data: galley }, { data: members }, { data: recipes }, { data: cookNextRows }, { data: allRecipeCounts }, availableTags] = await Promise.all([
    supabase.from("galleys").select("id, name, header_image_path").eq("id", galleyId).single(),
    supabase
      .from("galley_members")
      .select("user_id, users(name, avatar_url)")
      .eq("galley_id", galleyId)
      .limit(5),
    recipesQuery.limit(PAGE_SIZE + 1),
    supabase.from("cook_next_list").select("recipe_id").eq("galley_id", galleyId),
    supabase.from("recipes").select("galley_id").in("galley_id", galleyIds).is("deleted_at", null),
    loadAvailableTags(supabase, galleyId),
  ]);

  const recipeCountByGalley: Record<string, number> = {};
  for (const row of allRecipeCounts ?? []) {
    recipeCountByGalley[row.galley_id] = (recipeCountByGalley[row.galley_id] ?? 0) + 1;
  }

  const galleyOptions = memberships.map((m) => ({
    id: m.galley_id,
    name: m.galleys?.name ?? "Unnamed",
    recipeCount: recipeCountByGalley[m.galley_id] ?? 0,
  }));
  const otherGalleys = galleyOptions.filter((g) => g.id !== galleyId).map(({ id, name }) => ({ id, name }));

  const hasMore = (recipes?.length ?? 0) > PAGE_SIZE;
  const pagedRecipes = hasMore ? recipes!.slice(0, PAGE_SIZE) : (recipes ?? []);
  const cookNextIds = new Set((cookNextRows ?? []).map((r) => r.recipe_id));

  const typedMembers = (members ?? []) as unknown as Array<{
    user_id: string;
    users: { name: string | null; avatar_url: string | null } | null;
  }>;
  const membersNeedingFallback = typedMembers.filter((m) => !m.users || !m.users.name);
  if (membersNeedingFallback.length > 0) {
    const serviceClient = createServiceClient();
    await Promise.all(
      membersNeedingFallback.map(async (m) => {
        const { data } = await serviceClient.auth.admin.getUserById(m.user_id);
        if (data?.user) {
          m.users = {
            name: (data.user.user_metadata?.full_name as string | null) ?? null,
            avatar_url: (data.user.user_metadata?.avatar_url as string | null) ?? null,
          };
        }
      })
    );
  }

  if (!galley) {
    redirect(`/${locale}/onboarding`);
  }

  const headerImageUrl = (galley as unknown as { header_image_path: string | null }).header_image_path
    ? supabase.storage
        .from("recipe-photos")
        .getPublicUrl((galley as unknown as { header_image_path: string }).header_image_path).data.publicUrl
    : null;

  return (
    <div className="pb-6">
      {headerImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={headerImageUrl}
          alt=""
          className="w-full h-44 object-cover mb-4"
        />
      )}
      <div className={`px-5 ${headerImageUrl ? "pt-0" : "pt-2"}`}>
      <div className="mb-6">
        <div className="flex items-end justify-between mb-5">
          <h1 className="text-4xl font-thin text-anthracite leading-none">{t("title")}</h1>
          <Image
            src="/logo.png"
            alt="galleybook"
            width={75}
            height={75}
            className="object-contain object-right flex-shrink-0"
            priority
          />
        </div>

        {memberships.length > 1 && (
          <GalleySwitcher galleys={galleyOptions} activeGalleyId={galleyId} />
        )}

        {typedMembers.length > 0 && (
          <div className="flex items-center gap-2 mt-3">
            <div className="flex -space-x-2">
              {typedMembers.map((m) => {
                const u = m.users;
                return (
                  <div
                    key={m.user_id}
                    className="w-7 h-7 rounded-full bg-surface-low border-2 border-white overflow-hidden flex-shrink-0"
                  >
                    {u?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatar_url} alt={u.name ?? ""} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-surface-highest">
                        <span className="text-[8px] font-semibold text-anthracite">
                          {u?.name?.[0]?.toUpperCase() ?? "?"}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <span className="text-xs font-light text-on-surface-variant">
              {t("members", { count: typedMembers.length })}
            </span>
          </div>
        )}
      </div>

      <form method="GET" className="mb-4">
        <input
          name="search"
          defaultValue={params.search}
          placeholder={t("searchPlaceholder")}
          className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 placeholder:font-thin outline-none focus:ring-1 focus:ring-anthracite/20 transition-shadow"
        />
      </form>

      <LibraryFilters
        filters={tagFilters}
        available={availableTags}
        search={params.search ?? ""}
      />

      {pagedRecipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm font-light text-on-surface-variant mb-4">
            {t("noRecipes")}
          </p>
          <Link
            href="/new"
            style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
            className="border text-sm font-light px-6 py-3 rounded-full"
          >
            {t("addFirst")}
          </Link>
        </div>
      ) : (
        <LibraryRecipes
          key={galleyId}
          initialRecipes={pagedRecipes as never}
          initialHasMore={hasMore}
          initialCookNextIds={[...cookNextIds]}
          galleyId={galleyId}
          tagFilters={tagFilters}
          search={params.search ?? ""}
          otherGalleys={otherGalleys}
        />
      )}
      </div>
    </div>
  );
}

