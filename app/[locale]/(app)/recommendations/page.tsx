"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Link } from "@/i18n/routing";
import Image from "next/image";

const STORAGE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-photos`;

interface CookNextRecipe {
  id: string;
  name: string;
  prep_time: number | null;
  servings: number | null;
  type: string | null;
  season: string | null;
  recipe_photos: Array<{ storage_path: string; is_primary: boolean }>;
}

interface DiscoverResult {
  title: string;
  description: string;
  image_url: string | null;
  source_url: string;
  source_type: string;
  source_name: string;
}

function ThumbsUpIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
      <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/>
    </svg>
  );
}

function ThumbsDownIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
      <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/>
    </svg>
  );
}

function CookNextIcon({ color = "#ffffff" }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M13.5 3.5A6.5 6.5 0 1 0 13.5 14.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M9 5.5v7M5.5 9h7" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function CookNextCard({
  recipe,
  onThumbsUp,
  onThumbsDown,
  voted,
  inCookNextList,
  onAddToCookNext,
}: {
  recipe: CookNextRecipe;
  onThumbsUp: () => void;
  onThumbsDown: () => void;
  voted: "up" | "down" | null;
  inCookNextList: boolean;
  onAddToCookNext: () => void;
}) {
  const t = useTranslations("recommendations");
  const primaryPhoto = recipe.recipe_photos?.find((p) => p.is_primary) ?? recipe.recipe_photos?.[0];
  const imgSrc = primaryPhoto ? `${STORAGE_URL}/${primaryPhoto.storage_path}` : null;

  return (
    <div className="bg-white rounded-md shadow-ambient overflow-hidden">
      <Link href={`/recipe/${recipe.id}`}>
        <div className="relative w-full aspect-[4/3] bg-surface-low">
          {imgSrc ? (
            <Image src={imgSrc} alt={recipe.name} fill className="object-cover" sizes="512px" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M4 24l7-7 4 4 5-6 8 9H4z" stroke="#C6C6C6" strokeWidth="1.5" strokeLinejoin="round"/>
                <circle cx="10" cy="10" r="3" stroke="#C6C6C6" strokeWidth="1.5"/>
              </svg>
            </div>
          )}
        </div>
        <div className="px-4 pt-3 pb-1">
          <h3 className="text-sm font-light text-anthracite leading-snug">{recipe.name}</h3>
          <div className="flex items-center gap-3 mt-1">
            {recipe.prep_time && (
              <span className="text-xs font-light text-on-surface-variant">{recipe.prep_time} min</span>
            )}
            {recipe.servings && (
              <span className="text-xs font-light text-on-surface-variant">{recipe.servings}</span>
            )}
          </div>
        </div>
      </Link>

      <div className="flex items-center justify-center gap-6 px-4 pb-5 pt-3">
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={onThumbsDown}
            disabled={voted !== null}
            style={{ backgroundColor: "#252729", opacity: voted !== null && voted !== "down" ? 0.2 : 1 }}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-opacity disabled:cursor-not-allowed"
          >
            <ThumbsDownIcon />
          </button>
          <span className="text-[10px] font-light text-on-surface-variant">{t("notNow")}</span>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={onThumbsUp}
            disabled={voted !== null}
            style={{ backgroundColor: "#252729", opacity: voted !== null && voted !== "up" ? 0.2 : 1 }}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-opacity disabled:cursor-not-allowed"
          >
            <ThumbsUpIcon />
          </button>
          <span className="text-[10px] font-light text-on-surface-variant">{t("cookThis")}</span>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={onAddToCookNext}
            style={{ backgroundColor: inCookNextList ? "#252729" : "rgba(37,39,41,0.10)" }}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-opacity active:opacity-70"
          >
            <CookNextIcon color={inCookNextList ? "#ffffff" : "#252729"} />
          </button>
          <span className="text-[10px] font-light text-on-surface-variant">{t("cookNextAction")}</span>
        </div>
      </div>
    </div>
  );
}

function DiscoverCard({
  rec,
  onAdd,
  onReject,
  adding,
  rejected,
}: {
  rec: DiscoverResult;
  onAdd: () => void;
  onReject: () => void;
  adding: boolean;
  rejected: boolean;
}) {
  const t = useTranslations("recommendations");
  if (rejected) return null;

  return (
    <div className="bg-white rounded-md shadow-ambient overflow-hidden">
      {rec.image_url && (
        <div className="relative w-full aspect-[4/3] bg-surface-low">
          <Image src={rec.image_url} alt={rec.title} fill className="object-cover" sizes="512px" unoptimized />
          <div className="absolute top-3 right-3 bg-white/80 backdrop-blur-sm rounded-full px-2 py-0.5">
            <span className="text-[9px] font-light text-anthracite capitalize">{rec.source_type}</span>
          </div>
        </div>
      )}

      <div className="px-4 pt-3 pb-4">
        <a href={rec.source_url} target="_blank" rel="noopener noreferrer" className="block">
          <h3 className="text-sm font-light text-anthracite leading-snug">{rec.title}</h3>
          {rec.description && (
            <p className="text-xs font-light text-on-surface-variant mt-1 line-clamp-2">{rec.description}</p>
          )}
          <p className="text-[10px] font-light text-on-surface-variant/60 mt-1">{rec.source_name}</p>
        </a>

        <div className="flex gap-2 mt-3 items-center">
          <button
            onClick={onReject}
            style={{ backgroundColor: "#252729" }}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full transition-opacity"
          >
            <ThumbsDownIcon />
          </button>
          <button
            onClick={onAdd}
            disabled={adding}
            style={{ backgroundColor: "#252729", color: "#fff" }}
            className="flex-1 flex items-center justify-center gap-2 rounded-full py-2.5 text-xs font-light transition-opacity disabled:opacity-40"
          >
            <ThumbsUpIcon />
            <span>{adding ? t("parsing") : t("addToGalley")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RecommendationsPage() {
  const t = useTranslations("recommendations");
  const router = useRouter();

  const [cookNextRecipes, setCookNextRecipes] = useState<CookNextRecipe[]>([]);
  const [cookNextLoading, setCookNextLoading] = useState(true);
  const [votes, setVotes] = useState<Record<string, "up" | "down">>({});
  const [cookNextListIds, setCookNextListIds] = useState<Set<string>>(new Set());

  const [discoverResults, setDiscoverResults] = useState<DiscoverResult[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverStarted, setDiscoverStarted] = useState(false);
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [rejectedUrls, setRejectedUrls] = useState<Set<string>>(new Set());
  const [cuisine, setCuisine] = useState("");
  const [ingredient, setIngredient] = useState("");

  useEffect(() => {
    Promise.all([
      loadCookNext(),
      fetch("/api/cook-next-list")
        .then((r) => r.json())
        .then((d) => {
          const ids = new Set<string>((d.items ?? []).map((i: { recipe_id: string }) => i.recipe_id));
          setCookNextListIds(ids);
        }),
    ]);
  }, []);

  async function loadCookNext() {
    setCookNextLoading(true);
    try {
      const res = await fetch("/api/cook-next");
      if (res.ok) {
        const data = await res.json();
        setCookNextRecipes(data.recipes ?? []);
      }
    } finally {
      setCookNextLoading(false);
    }
  }

  async function handleAddToCookNextList(recipe: CookNextRecipe) {
    if (cookNextListIds.has(recipe.id)) {
      await fetch(`/api/cook-next-list/${recipe.id}`, { method: "DELETE" });
      setCookNextListIds((prev) => { const next = new Set(prev); next.delete(recipe.id); return next; });
    } else {
      await fetch("/api/cook-next-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId: recipe.id }),
      });
      setCookNextListIds((prev) => new Set([...prev, recipe.id]));
    }
  }

  async function handleCookNextVote(recipe: CookNextRecipe, vote: 1 | -1) {
    setVotes((prev) => ({ ...prev, [recipe.id]: vote === 1 ? "up" : "down" }));

    const res = await fetch("/api/cook-next/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId: recipe.id, vote, currentIds: cookNextRecipes.map((r) => r.id) }),
    });

    if (vote === -1 && res.ok) {
      const data = await res.json();
      if (data.replacement) {
        setTimeout(() => {
          setCookNextRecipes((prev) => prev.map((r) => (r.id === recipe.id ? data.replacement : r)));
          setVotes((prev) => { const next = { ...prev }; delete next[recipe.id]; return next; });
        }, 600);
      }
    }
  }

  async function startDiscover(opts?: { cuisine?: string; ingredient?: string }) {
    setDiscovering(true);
    setDiscoverStarted(true);
    setDiscoverResults([]);
    try {
      const params = new URLSearchParams();
      if (opts?.cuisine) params.set("cuisine", opts.cuisine);
      if (opts?.ingredient) params.set("ingredient", opts.ingredient);
      const url = params.toString() ? `/api/recommendations?${params}` : "/api/recommendations";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setDiscoverResults(data.recommendations ?? []);
      }
    } finally {
      setDiscovering(false);
    }
  }

  async function handleDiscoverAdd(rec: DiscoverResult) {
    setAddingUrl(rec.source_url);
    try {
      const parseRes = await fetch("/api/recipes/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: rec.source_url }),
      });
      if (!parseRes.ok) throw new Error();
      const parsed = await parseRes.json();

      const saveRes = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsed, source_url: rec.source_url }),
      });
      if (!saveRes.ok) throw new Error();
      const { id } = await saveRes.json();
      router.push(`/recipe/${id}`);
    } catch {
      alert("Failed to add recipe. Try opening the source link and adding manually.");
    } finally {
      setAddingUrl(null);
    }
  }

  async function handleDiscoverReject(rec: DiscoverResult) {
    setRejectedUrls((prev) => new Set([...prev, rec.source_url]));
    await fetch("/api/discover/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: rec.source_url, title: rec.title }),
    });
  }

  const visibleResults = discoverResults.filter((r) => !rejectedUrls.has(r.source_url));

  return (
    <div className="px-5 pt-12 pb-24">

      <section className="mb-10">
        <p className="text-xs font-light tracking-widest uppercase text-on-surface-variant mb-1">
          {t("fromLibrary")}
        </p>
        <h2 className="text-4xl font-thin text-anthracite mb-5">{t("cookNextTitle")}</h2>

        {cookNextLoading ? (
          <div className="grid grid-cols-1 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-md bg-surface-low animate-pulse">
                <div className="w-full aspect-[4/3] bg-surface-highest rounded-t-md" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-surface-highest rounded w-3/4" />
                  <div className="h-3 bg-surface-highest rounded w-1/3" />
                  <div className="h-9 bg-surface-highest rounded-full mt-3" />
                </div>
              </div>
            ))}
          </div>
        ) : cookNextRecipes.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-light text-on-surface-variant mb-2">{t("noRecipes")}</p>
            <Link
              href="/new"
              style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
              className="inline-block border text-sm font-light px-6 py-2.5 rounded-full mt-2"
            >
              {t("addFirst")}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {cookNextRecipes.map((recipe) => (
              <CookNextCard
                key={recipe.id}
                recipe={recipe}
                voted={votes[recipe.id] ?? null}
                onThumbsUp={() => handleCookNextVote(recipe, 1)}
                onThumbsDown={() => handleCookNextVote(recipe, -1)}
                inCookNextList={cookNextListIds.has(recipe.id)}
                onAddToCookNext={() => handleAddToCookNextList(recipe)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <p className="text-xs font-light tracking-widest uppercase text-on-surface-variant mb-1">
          {t("newRecipes")}
        </p>
        <h2 className="text-4xl font-thin text-anthracite mb-2">{t("discoverTitle")}</h2>
        <p className="text-xs font-light text-on-surface-variant mb-5">{t("discoverSubtitle")}</p>

        {!discoverStarted ? (
          <div className="space-y-3">
            <button
              onClick={() => startDiscover()}
              style={{ backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
              className="w-full border text-sm font-light py-3 rounded-full"
            >
              {t("discoverButton")}
            </button>

            <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant text-center pt-1">
              {t("searchSpecifically")}
            </p>

            <h3 className="text-2xl font-thin text-anthracite pt-1">{t("searchForNewRecipes")}</h3>

            <input
              value={cuisine}
              onChange={(e) => setCuisine(e.target.value)}
              placeholder={t("cuisinePlaceholder")}
              className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
            />
            <input
              value={ingredient}
              onChange={(e) => setIngredient(e.target.value)}
              placeholder={t("ingredientPlaceholder")}
              className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
            />
            <button
              onClick={() => startDiscover({ cuisine: cuisine || undefined, ingredient: ingredient || undefined })}
              disabled={!cuisine.trim() && !ingredient.trim()}
              style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
              className="w-full border text-sm font-light py-3 rounded-full transition-opacity disabled:opacity-40"
            >
              {t("search")}
            </button>
          </div>
        ) : discovering ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 py-4">
              <svg className="animate-spin" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14 8A6 6 0 112 8" stroke="#252729" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="text-sm font-light text-on-surface-variant">{t("searching")}</span>
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-md bg-surface-low animate-pulse">
                <div className="w-full aspect-[4/3] bg-surface-highest rounded-t-md" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-surface-highest rounded w-3/4" />
                  <div className="h-3 bg-surface-highest rounded w-1/2" />
                  <div className="h-9 bg-surface-highest rounded-full mt-2" />
                </div>
              </div>
            ))}
          </div>
        ) : visibleResults.length === 0 ? (
          <div className="py-10 text-center space-y-4">
            <p className="text-sm font-light text-on-surface-variant">{t("noResults")}</p>
            <button
              onClick={() => startDiscover({ cuisine: cuisine || undefined, ingredient: ingredient || undefined })}
              style={{ backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
              className="border text-sm font-light px-6 py-2.5 rounded-full"
            >
              {t("tryAgain")}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleResults.map((rec) => (
              <DiscoverCard
                key={rec.source_url}
                rec={rec}
                onAdd={() => handleDiscoverAdd(rec)}
                onReject={() => handleDiscoverReject(rec)}
                adding={addingUrl === rec.source_url}
                rejected={rejectedUrls.has(rec.source_url)}
              />
            ))}
            <button
              onClick={() => startDiscover({ cuisine: cuisine || undefined, ingredient: ingredient || undefined })}
              style={{ backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
              className="w-full border text-sm font-light py-3 rounded-full mt-2"
            >
              {t("searchAgain")}
            </button>
          </div>
        )}
      </section>

    </div>
  );
}
