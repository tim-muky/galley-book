"use client";

import { useRouter } from "next/navigation";

interface Props {
  galleys: { id: string; name: string; recipeCount?: number }[];
  activeGalleyId: string;
}

export function GalleySwitcher({ galleys, activeGalleyId }: Props) {
  const router = useRouter();

  function switchGalley(galleyId: string) {
    document.cookie = `active_galley_id=${galleyId}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 scrollbar-hide mt-2 mb-1">
      {galleys.map((g) => {
        const isActive = g.id === activeGalleyId;
        return (
          <button
            key={g.id}
            onClick={() => switchGalley(g.id)}
            style={
              isActive
                ? { backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }
                : { backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }
            }
            className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-light border transition-colors flex items-center gap-2"
          >
            {g.name}
            {g.recipeCount !== undefined && (
              <span className="opacity-60">{g.recipeCount}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
