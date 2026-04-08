import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { RecipeCard } from "@/components/recipe-card";
import Link from "next/link";
import Image from "next/image";

const FILTER_TYPES = [
  { label: "All", value: "" },
  { label: "Quick (≤30m)", value: "quick" },
  { label: "Starter", value: "starter" },
  { label: "Main", value: "main" },
  { label: "Dessert", value: "dessert" },
  { label: "Plant-based", value: "plant" },
] as const;

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
  const params = await searchParams;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Parallel: profile + membership in one round-trip
  const [{ data: membershipData }] = await Promise.all([
    supabase
      .from("galley_members")
      .select("galley_id")
      .eq("user_id", user.id)
      .order("invited_at", { ascending: true })
      .limit(1)
      .single(),
  ]);

  if (!membershipData?.galley_id) {
    return <CreateGalleyPrompt />;
  }

  const galleyId = membershipData.galley_id;

  // Parallel: galley info + members + recipes all at once
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

  const [{ data: galley }, { data: members }, { data: recipes }] = await Promise.all([
    supabase.from("galleys").select("id, name").eq("id", galleyId).single(),
    supabase
      .from("galley_members")
      .select("user_id, users(name, avatar_url)")
      .eq("galley_id", galleyId)
      .limit(5),
    recipesQuery,
  ]);

  if (!galley) {
    return <CreateGalleyPrompt />;
  }

  return (
    <div className="px-5 pt-4 pb-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <Image
            src="/logo.png"
            alt="Galley Book"
            width={150}
            height={150}
            className="object-contain"
            priority
          />
        </div>
        {/* Library + Galley name on same line, bottom-aligned */}
        <div className="flex items-end gap-3">
          <h1 className="text-4xl font-thin text-anthracite leading-none">Library</h1>
          <p className="text-xs font-light tracking-widest uppercase text-on-surface-variant leading-none mb-[3px]">
            {galley.name}
          </p>
        </div>

        {/* Member avatars */}
        {members && members.length > 0 && (
          <div className="flex items-center gap-2 mt-3">
            <div className="flex -space-x-2">
              {members.map((m) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const u = m.users as unknown as { name: string | null; avatar_url: string | null } | null;
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
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          </div>
        )}
      </div>

      {/* Search */}
      <form method="GET" className="mb-4">
        <input
          name="search"
          defaultValue={params.search}
          placeholder="Search recipes…"
          className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 placeholder:font-thin outline-none focus:ring-1 focus:ring-anthracite/20 transition-shadow"
        />
      </form>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 -mx-5 px-5 scrollbar-hide">
        {FILTER_TYPES.map((f) => {
          const active = (params.filter ?? "") === f.value;
          return (
            <Link
              key={f.value}
              href={f.value ? `/library?filter=${f.value}` : "/library"}
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-light border transition-colors"
              style={active
                ? { backgroundColor: "#252729", color: "#fff", borderColor: "#fff" }
                : { backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {/* Recipe grid */}
      {!recipes || recipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm font-light text-on-surface-variant mb-4">
            No recipes yet.
          </p>
          <Link
            href="/new"
            className="bg-anthracite text-white text-sm font-light px-6 py-3 rounded-full border border-anthracite"
          >
            Add your first recipe
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateGalleyPrompt() {
  return (
    <div className="px-5 pt-12 min-h-screen flex flex-col">
      <h1 className="text-4xl font-thin text-anthracite mb-2">Welcome</h1>
      <p className="text-sm font-light text-on-surface-variant mb-8">
        Create your first Galley to start collecting recipes.
      </p>
      <form action="/api/galleys" method="POST">
        <input
          name="name"
          placeholder="e.g. The Meyerdierks Kitchen"
          className="w-full bg-surface-highest rounded-sm px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none mb-4"
        />
        <button
          type="submit"
          className="w-full bg-anthracite text-white text-sm font-light py-4 rounded-full border border-anthracite"
        >
          Create Galley
        </button>
      </form>
    </div>
  );
}
