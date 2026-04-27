import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
export const dynamic = "force-dynamic";
import { Link } from "@/i18n/routing";
import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { GalleySwitcher } from "@/components/galley-switcher";
import { LibraryRecipes } from "./library-recipes-client";
import Image from "next/image";

const PAGE_SIZE = 20;

interface SearchParams {
  filter?: string;
  search?: string;
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

  const { data: membershipsRaw } = await supabase
    .from("galley_members")
    .select("galley_id, is_default, galleys(id, name)")
    .eq("user_id", user.id)
    .order("invited_at", { ascending: true });

  type MembershipRow = { galley_id: string; is_default: boolean; galleys: { id: string; name: string } | null };
  const memberships = (membershipsRaw ?? []) as unknown as MembershipRow[];

  if (memberships.length === 0) {
    return <CreateGalleyPrompt />;
  }

  const cookieStore = await cookies();
  const cookieGalleyId = cookieStore.get("active_galley_id")?.value;
  const validFromCookie = cookieGalleyId ? memberships.find((m) => m.galley_id === cookieGalleyId) : null;
  const activeMembership = validFromCookie ?? memberships.find((m) => m.is_default) ?? memberships[0];
  const galleyId = activeMembership.galley_id;

  let recipesQuery = supabase
    .from("recipes")
    .select(`*, recipe_photos(*)`)
    .eq("galley_id", galleyId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (params.filter === "quick") {
    recipesQuery = recipesQuery.lte("prep_time", 30);
  } else if (
    params.filter &&
    ["starter", "main", "dessert", "breakfast", "snack", "drink", "side"].includes(params.filter)
  ) {
    recipesQuery = recipesQuery.eq("type", params.filter);
  }

  if (params.search) {
    recipesQuery = recipesQuery.ilike("name", `%${params.search}%`);
  }

  const galleyIds = memberships.map((m) => m.galley_id);

  const [{ data: galley }, { data: members }, { data: recipes }, { data: cookNextRows }, { data: allRecipeCounts }] = await Promise.all([
    supabase.from("galleys").select("id, name").eq("id", galleyId).single(),
    supabase
      .from("galley_members")
      .select("user_id, users(name, avatar_url)")
      .eq("galley_id", galleyId)
      .limit(5),
    recipesQuery.limit(PAGE_SIZE + 1),
    supabase.from("cook_next_list").select("recipe_id").eq("galley_id", galleyId),
    supabase.from("recipes").select("galley_id").in("galley_id", galleyIds).is("deleted_at", null),
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
    return <CreateGalleyPrompt />;
  }

  const FILTER_TYPES = [
    { label: t("filter.all"), value: "" },
    { label: t("filter.quick"), value: "quick" },
    { label: t("filter.starter"), value: "starter" },
    { label: t("filter.main"), value: "main" },
    { label: t("filter.dessert"), value: "dessert" },
  ];

  return (
    <div className="px-5 pt-2 pb-6">
      <div className="mb-6">
        <div className="flex items-center mb-1">
          <Image
            src="/logo.png"
            alt="Galley Book"
            width={75}
            height={75}
            className="object-contain object-left"
            priority
          />
        </div>
        <h1 className="text-4xl font-thin text-anthracite leading-none">{t("title")}</h1>

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

      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 -mx-5 px-5 scrollbar-hide">
        {FILTER_TYPES.map((f) => {
          const active = (params.filter ?? "") === f.value;
          return (
            <Link
              key={f.value}
              href={f.value ? `/library?filter=${f.value}` : "/library"}
              style={active ? { backgroundColor: "#252729", color: "#fff", borderColor: "#252729" } : { backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-light border transition-colors"
            >
              {f.label}
            </Link>
          );
        })}
      </div>

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
          initialRecipes={pagedRecipes as never}
          initialHasMore={hasMore}
          initialCookNextIds={[...cookNextIds]}
          galleyId={galleyId}
          filter={params.filter ?? ""}
          search={params.search ?? ""}
          otherGalleys={otherGalleys}
        />
      )}
    </div>
  );
}

async function CreateGalleyPrompt() {
  const t = await getTranslations("library.galleyPrompt");
  const tc = await getTranslations("common");

  return (
    <div className="px-5 pt-12 min-h-screen flex flex-col">
      <h1 className="text-4xl font-thin text-anthracite mb-2">{t("title")}</h1>
      <p className="text-sm font-light text-on-surface-variant mb-8">{t("subtitle")}</p>
      <form action="/api/galleys" method="POST">
        <input
          name="name"
          placeholder={t("placeholder")}
          className="w-full bg-surface-highest rounded-sm px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none mb-4"
        />
        <button
          type="submit"
          style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
          className="w-full border text-sm font-light py-4 rounded-full"
        >
          {t("button")}
        </button>
      </form>
    </div>
  );
}
