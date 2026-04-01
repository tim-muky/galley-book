"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

const STORAGE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-photos`;

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function ThumbsUpIcon({ color = "white" }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3m7-10v3a3 3 0 01-3 3H9l-2 7h10a2 2 0 002-2V9a2 2 0 00-2-2h-2.5"
        stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M7 11V22" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

function ThumbsDownIcon({ color = "white" }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M17 2h3a2 2 0 012 2v7a2 2 0 01-2 2h-3M10 22v-3a3 3 0 013-3h5l2-7H10a2 2 0 00-2 2v7a2 2 0 002 2z"
        stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M17 13V2" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Cook Next Card ───────────────────────────────────────────────────────────

function CookNextCard({
  recipe,
  onThumbsUp,
  onThumbsDown,
  voted,
}: {
  recipe: CookNextRecipe;
  onThumbsUp: () => void;
  onThumbsDown: () => void;
  voted: "up" | "down" | null;
}) {
  const primaryPhoto =
    recipe.recipe_photos?.find((p) => p.is_primary) ?? recipe.recipe_photos?.[0];
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
              <span className="text-xs font-light text-on-surface-variant">Serves {recipe.servings}</span>
            )}
          </div>
        </div>
      </Link>

      {/* Vote buttons */}
      <div className="flex items-center justify-center gap-10 px-4 pb-5 pt-3">
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={onThumbsDown}
            disabled={voted !== null}
            style={{
              backgroundColor: "#fff",
              borderColor: "#252729",
              opacity: voted !== null && voted !== "down" ? 0.2 : 1,
            }}
            className="w-12 h-12 rounded-full border flex items-center justify-center transition-opacity disabled:cursor-not-allowed"
          >
            <ThumbsDownIcon color="#252729" />
          </button>
          <span className="text-[10px] font-light text-on-surface-variant">Not now</span>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={onThumbsUp}
            disabled={voted !== null}
            style={{
              backgroundColor: "#fff",
              borderColor: "#252729",
              opacity: voted !== null && voted !== "up" ? 0.2 : 1,
            }}
            className="w-12 h-12 rounded-full border flex items-center justify-center transition-opacity disabled:cursor-not-allowed"
          >
            <ThumbsUpIcon color="#252729" />
          </button>
          <span className="text-[10px] font-light text-on-surface-variant">Cook this</span>
        </div>
      </div>
    </div>
  );
}

// ─── Discover Card ────────────────────────────────────────────────────────────

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
  if (rejected) return null;

  return (
    <div className="bg-white rounded-md shadow-ambient overflow-hidden">
      {rec.image_url && (
        <div className="relative w-full aspect-[4/3] bg-surface-low">
          <Image
            src={rec.image_url}
            alt={rec.title}
            fill
            className="object-cover"
            sizes="512px"
            unoptimized
          />
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
            <ThumbsDownIcon color="white" />
          </button>
          <button
            onClick={onAdd}
            disabled={adding}
            style={{ backgroundColor: "#252729", color: "#fff" }}
            className="flex-1 flex items-center justify-center gap-2 rounded-full py-2.5 text-xs font-light transition-opacity disabled:opacity-40"
          >
            <ThumbsUpIcon color="white" />
            <span>{adding ? "Parsing…" : "Add to Galley"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RecommendationsPage() {
  // Cook Next state
  const [cookNextRecipes, setCookNextRecipes] = useState<CookNextRecipe[]>([]);
  const [cookNextLoading, setCookNextLoading] = useState(true);
  const [votes, setVotes] = useState<Record<string, "up" | "down">>({});

  // Discover state
  const [discoverResults, setDiscoverResults] = useState<DiscoverResult[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverStarted, setDiscoverStarted] = useState(false);
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [rejectedUrls, setRejectedUrls] = useState<Set<string>>(new Set());

  // ── Load Cook Next on mount ──────────────────────────────────────────────
  useEffect(() => {
    loadCookNext();
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

  async function handleCookNextVote(recipe: CookNextRecipe, vote: 1 | -1) {
    setVotes((prev) => ({ ...prev, [recipe.id]: vote === 1 ? "up" : "down" }));

    const res = await fetch("/api/cook-next/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipeId: recipe.id,
        vote,
        currentIds: cookNextRecipes.map((r) => r.id),
      }),
    });

    if (vote === -1 && res.ok) {
      const data = await res.json();
      if (data.replacement) {
        // Replace the thumbs-down card after a short delay
        setTimeout(() => {
          setCookNextRecipes((prev) =>
            prev.map((r) => (r.id === recipe.id ? data.replacement : r))
          );
          setVotes((prev) => {
            const next = { ...prev };
            delete next[recipe.id];
            return next;
          });
        }, 600);
      }
    }
  }

  // ── Discover ──────────────────────────────────────────────────────────────
  async function startDiscover() {
    setDiscovering(true);
    setDiscoverStarted(true);
    setDiscoverResults([]);
    try {
      const res = await fetch("/api/recommendations");
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
      window.location.href = `/recipe/${id}`;
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

      {/* ── Cook Next ─────────────────────────────────────────────────────── */}
      <section className="mb-10">
        <p className="text-xs font-light tracking-widest uppercase text-on-surface-variant mb-1">
          From your library
        </p>
        <h2 className="text-4xl font-thin text-anthracite mb-5">Cook Next</h2>

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
            <p className="text-sm font-light text-on-surface-variant mb-2">
              No recipes in your library yet.
            </p>
            <Link
              href="/new"
              style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#fff" }}
              className="inline-block border text-sm font-light px-6 py-2.5 rounded-full mt-2"
            >
              Add your first recipe
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
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Discover ──────────────────────────────────────────────────────── */}
      <section>
        <p className="text-xs font-light tracking-widest uppercase text-on-surface-variant mb-1">
          New recipes
        </p>
        <h2 className="text-4xl font-thin text-anthracite mb-2">Discover</h2>
        <p className="text-xs font-light text-on-surface-variant mb-5">
          AI searches your saved sources for recipes you haven't tried yet.
        </p>

        {!discoverStarted ? (
          <button
            onClick={startDiscover}
            style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#fff" }}
            className="w-full border text-sm font-light py-4 rounded-full transition-opacity"
          >
            Start Discover
          </button>
        ) : discovering ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 py-4">
              <svg className="animate-spin" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14 8A6 6 0 112 8" stroke="#252729" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="text-sm font-light text-on-surface-variant">
                Searching your sources…
              </span>
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
            <p className="text-sm font-light text-on-surface-variant">
              No results found. Add sources in Settings or try again.
            </p>
            <button
              onClick={startDiscover}
              style={{ backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
              className="border text-sm font-light px-6 py-2.5 rounded-full"
            >
              Try Again
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
              onClick={startDiscover}
              style={{ backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
              className="w-full border text-sm font-light py-3 rounded-full mt-2"
            >
              Search Again
            </button>
          </div>
        )}
      </section>

    </div>
  );
}
