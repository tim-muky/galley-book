import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { Link } from "@/i18n/routing";
import { DeleteRecipeButton } from "@/app/(app)/recipe/[id]/delete-button";
import { CopyMoveButton } from "@/app/(app)/recipe/[id]/copy-move-button";
import { ShareButton } from "@/components/share-button";
import { VoteSection } from "@/app/(app)/recipe/[id]/vote-section";
import { AddToCookNextButton } from "@/components/add-to-cook-next-button";
import { RecipeContent } from "@/app/(app)/recipe/[id]/recipe-content";
import { RecipeComments, type CommentItem } from "@/components/recipe-comments";
import type { RecipeTranslation } from "@/types/database";

const STORAGE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-photos`;

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const supabase = await createClient();
  const t = await getTranslations("recipe");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: membershipsRaw } = await supabase
    .from("galley_members")
    .select("galley_id, galleys(id, name)")
    .eq("user_id", user.id)
    .order("invited_at", { ascending: true });

  const membership = membershipsRaw?.[0];

  const [{ data: recipe }, { data: cookNextRow }, { data: userRow }, { data: voteSummary }, { data: userVoteRow }] = await Promise.all([
    supabase
      .from("recipes")
      .select(`*, recipe_photos(*), ingredients(*), preparation_steps(*)`)
      .eq("id", id)
      .single(),
    membership?.galley_id
      ? supabase
          .from("cook_next_list")
          .select("id")
          .eq("galley_id", membership.galley_id)
          .eq("recipe_id", id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("users").select("translation_language").eq("id", user.id).single(),
    supabase.from("recipe_vote_summary").select("vote_count, vote_avg").eq("recipe_id", id).maybeSingle(),
    supabase.from("votes").select("value").eq("recipe_id", id).eq("user_id", user.id).maybeSingle(),
  ]);

  const translationLanguage = userRow?.translation_language ?? null;

  const { data: translationRaw } = translationLanguage
    ? await supabase
        .from("recipe_translations")
        .select("*")
        .eq("recipe_id", id)
        .eq("language", translationLanguage)
        .maybeSingle()
    : { data: null };

  const translation = (translationRaw ?? null) as RecipeTranslation | null;

  if (!recipe) notFound();

  const { data: galleyRow } = await supabase
    .from("galleys")
    .select("owner_id")
    .eq("id", recipe.galley_id)
    .single();
  const isGalleyOwner = (galleyRow as { owner_id: string } | null)?.owner_id === user.id;

  const { data: commentRows } = await supabase
    .from("recipe_comments")
    .select("id, body, created_at, author_id")
    .eq("recipe_id", id)
    .order("created_at", { ascending: true });

  type CommentRow = { id: string; body: string; created_at: string; author_id: string | null };
  const commentList = (commentRows ?? []) as unknown as CommentRow[];

  const authorIds = Array.from(
    new Set(commentList.map((c) => c.author_id).filter((v): v is string => !!v))
  );
  const profileMap = new Map<string, { name: string | null; avatar_url: string | null }>();
  if (authorIds.length > 0) {
    const service = createServiceClient();
    const { data: profiles } = await service
      .from("users")
      .select("id, name, avatar_url")
      .in("id", authorIds);
    for (const p of (profiles ?? []) as Array<{ id: string; name: string | null; avatar_url: string | null }>) {
      profileMap.set(p.id, { name: p.name, avatar_url: p.avatar_url });
    }
  }

  const initialComments: CommentItem[] = commentList.map((c) => {
    const profile = c.author_id ? profileMap.get(c.author_id) : null;
    return {
      id: c.id,
      body: c.body,
      created_at: c.created_at,
      author_id: c.author_id,
      author_name: profile?.name ?? null,
      author_avatar_url: profile?.avatar_url ?? null,
    };
  });

  const currentProfile = profileMap.get(user.id) ?? null;
  let currentUserName = currentProfile?.name ?? null;
  let currentUserAvatarUrl = currentProfile?.avatar_url ?? null;
  if (!currentUserName || !currentUserAvatarUrl) {
    const service = createServiceClient();
    const { data: me } = await service
      .from("users")
      .select("name, avatar_url")
      .eq("id", user.id)
      .single();
    const meRow = me as { name: string | null; avatar_url: string | null } | null;
    currentUserName = currentUserName ?? meRow?.name ?? null;
    currentUserAvatarUrl = currentUserAvatarUrl ?? meRow?.avatar_url ?? null;
  }

  const otherGalleys = (membershipsRaw ?? [])
    .filter((m) => m.galley_id !== recipe.galley_id)
    .flatMap((m) => {
      const g = m.galleys as unknown as { id: string; name: string } | { id: string; name: string }[] | null;
      if (!g) return [];
      return Array.isArray(g) ? g : [g];
    });

  const isInCookNext = !!cookNextRow;

  const photos = (recipe.recipe_photos ?? []).sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order);
  const primaryPhoto = photos.find((p: { is_primary: boolean }) => p.is_primary) ?? photos[0];
  const ingredients = (recipe.ingredients ?? []).sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order);
  const steps = (recipe.preparation_steps ?? []).sort((a: { step_number: number }, b: { step_number: number }) => a.step_number - b.step_number);
  const summary = voteSummary as unknown as { vote_count: number; vote_avg: number } | null;
  const avgVote = summary?.vote_avg ?? null;

  return (
    <div className="min-h-screen bg-white">
      <div className="relative w-full aspect-[3/2] bg-surface-low">
        {primaryPhoto ? (
          <Image
            src={`${STORAGE_URL}/${primaryPhoto.storage_path}`}
            alt={recipe.name}
            fill
            className="object-cover"
            priority
            sizes="(max-width: 512px) 100vw, 512px"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-low">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path d="M6 36l10-10 6 6 8-9 12 13H6z" stroke="#C6C6C6" strokeWidth="2" strokeLinejoin="round"/>
              <circle cx="15" cy="15" r="4" stroke="#C6C6C6" strokeWidth="2"/>
            </svg>
          </div>
        )}

        <Link
          href="/library"
          aria-label={t("backToLibrary")}
          className="absolute top-4 left-4 w-11 h-11 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-full shadow-ambient"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>

        <div className="absolute top-4 right-4 flex items-center gap-2">
          <AddToCookNextButton recipeId={id} initialInList={isInCookNext} />
          {recipe.share_token && (
            <ShareButton shareToken={recipe.share_token} recipeName={recipe.name} />
          )}
          <Link
            href={`/recipe/${id}/edit`}
            aria-label={t("edit")}
            className="w-11 h-11 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-full shadow-ambient"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M10.5 2.5l2 2-8 8H2.5v-2l8-8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-5 pb-5 pt-12">
          <h1 className="text-3xl font-thin text-white leading-tight">{recipe.name}</h1>
          <div className="flex items-center gap-4 mt-1">
            {recipe.prep_time && (
              <span className="text-xs font-light text-white/80">{t("prepTime", { n: recipe.prep_time })}</span>
            )}
            {recipe.servings && (
              <span className="text-xs font-light text-white/80">{t("servings", { n: recipe.servings })}</span>
            )}
            {avgVote && (
              <span className="text-xs font-light text-white/80">★ {avgVote}</span>
            )}
          </div>
        </div>
      </div>

      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-5 py-3 bg-white">
          {photos.map((p: { id: string; storage_path: string; is_primary: boolean }) => (
            <div key={p.id} className="flex-shrink-0 w-16 h-16 rounded-md overflow-hidden bg-surface-low">
              <Image
                src={`${STORAGE_URL}/${p.storage_path}`}
                alt=""
                width={64}
                height={64}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      )}

      <div className="px-5 py-6 space-y-8">
        <div className="flex flex-wrap gap-2">
          {recipe.season && recipe.season !== "all_year" && (
            <span className="px-3 py-1 bg-surface-low rounded-full text-xs font-light text-on-surface-variant capitalize">
              {recipe.season}
            </span>
          )}
          {recipe.type && (
            <span className="px-3 py-1 bg-surface-low rounded-full text-xs font-light text-on-surface-variant capitalize">
              {recipe.type}
            </span>
          )}
          {recipe.source_url && (
            <a
              href={recipe.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 bg-surface-low rounded-full text-xs font-light text-on-surface-variant flex items-center gap-1"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M4 2H2v6h6V6M6 1h3v3M8.5 1.5L4.5 5.5" stroke="#474747" strokeWidth="1" strokeLinecap="round"/>
              </svg>
              {t("source")}
            </a>
          )}
        </div>

        <RecipeContent
          recipeId={id}
          description={recipe.description ?? null}
          ingredients={ingredients}
          steps={steps}
          translation={translation}
          translationLanguage={translationLanguage}
          shareToken={recipe.share_token}
          servings={recipe.servings ?? null}
        />

        <VoteSection
          recipeId={id}
          initialVote={(userVoteRow as unknown as { value: number } | null)?.value ?? null}
        />

        <RecipeComments
          recipeId={id}
          initialComments={initialComments}
          currentUserId={user.id}
          currentUserName={currentUserName}
          currentUserAvatarUrl={currentUserAvatarUrl}
          isGalleyOwner={isGalleyOwner}
          labels={{
            heading: t("comments.heading"),
            placeholder: t("comments.placeholder"),
            post: t("comments.post"),
            posting: t("comments.posting"),
            delete: t("comments.delete"),
            empty: t("comments.empty"),
          }}
        />

        <div className="pt-4 pb-2 space-y-3">
          {otherGalleys.length > 0 && (
            <CopyMoveButton recipeId={id} otherGalleys={otherGalleys} />
          )}
          <DeleteRecipeButton recipeId={id} />
        </div>
      </div>
    </div>
  );
}
