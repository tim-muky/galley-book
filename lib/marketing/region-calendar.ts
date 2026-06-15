/**
 * Regional dish calendar for the Friday "Best dish from … (region)" Campaign
 * Studio flow (GAL-447).
 *
 * One region per ISO calendar week (1–52), rotating through the fixed list
 * Tim curated — Mediterranean Europe first (Italy/Spain/France/Portugal/
 * Greece/Croatia), then Latin America, then East/Southeast Asia. The list
 * happens to contain exactly 52 regions, so each maps directly to a week and
 * the cycle repeats every year.
 *
 * `region` + `country` are the user-facing names; `de` is a short German gloss
 * for the AI brief (galleybook's primary market is DACH, so posts default to
 * German).
 *
 * Mirrors `veggie-calendar.ts` — same shape, same brief-builder contract — so
 * the rest of the pipeline (candidate generation → images → distribution) is
 * unchanged regardless of which weekly content type triggered the run.
 */

import { getISOWeek } from "./veggie-calendar";

export interface RegionWeek {
  /** ISO week number, 1–52 */
  week: number;
  /** The region / city as users see it */
  region: string;
  /** Country the region belongs to (Singapore / Taiwan / Hong Kong are their own) */
  country: string;
  /** Short German cuisine gloss carried into the AI brief */
  de: string;
}

/**
 * 52 regions, in Tim's curated order. Week N → REGION_CALENDAR[N-1].
 * Keep this list at exactly 52 entries so the week mapping stays 1:1.
 */
export const REGION_CALENDAR: RegionWeek[] = [
  // Italy
  { week: 1, region: "Campania", country: "Italy", de: "kampanische Küche (Neapel, Amalfi)" },
  { week: 2, region: "Emilia-Romagna", country: "Italy", de: "Küche der Emilia-Romagna (Bologna, Parma)" },
  { week: 3, region: "Tuscany", country: "Italy", de: "toskanische Küche" },
  { week: 4, region: "Sicily", country: "Italy", de: "sizilianische Küche" },
  { week: 5, region: "Piedmont", country: "Italy", de: "piemontesische Küche" },
  { week: 6, region: "Liguria", country: "Italy", de: "ligurische Küche (Genua)" },
  { week: 7, region: "Veneto", country: "Italy", de: "venezianische Küche" },
  { week: 8, region: "Puglia", country: "Italy", de: "apulische Küche" },
  { week: 9, region: "Lazio", country: "Italy", de: "römische Küche (Latium)" },
  // Spain
  { week: 10, region: "Basque Country", country: "Spain", de: "baskische Küche" },
  { week: 11, region: "Catalonia", country: "Spain", de: "katalanische Küche" },
  { week: 12, region: "Andalusia", country: "Spain", de: "andalusische Küche" },
  // France
  { week: 13, region: "Provence", country: "France", de: "provenzalische Küche" },
  { week: 14, region: "Burgundy", country: "France", de: "burgundische Küche" },
  { week: 15, region: "Rhône-Alpes", country: "France", de: "Küche der Rhône-Alpen (Lyon)" },
  // Portugal
  { week: 16, region: "Algarve", country: "Portugal", de: "Algarve-Küche" },
  { week: 17, region: "Beja District", country: "Portugal", de: "Alentejo-Küche (Beja)" },
  // Greece
  { week: 18, region: "Crete", country: "Greece", de: "kretische Küche" },
  { week: 19, region: "Macedonia", country: "Greece", de: "makedonische Küche (Nordgriechenland)" },
  { week: 20, region: "Cyclades", country: "Greece", de: "Küche der Kykladen" },
  { week: 21, region: "Peloponnese", country: "Greece", de: "Küche des Peloponnes" },
  { week: 22, region: "North Aegean", country: "Greece", de: "nordägäische Inselküche" },
  { week: 23, region: "Thessaly", country: "Greece", de: "thessalische Küche" },
  // Croatia
  { week: 24, region: "Dalmatia", country: "Croatia", de: "dalmatinische Küche" },
  { week: 25, region: "Istria", country: "Croatia", de: "istrische Küche" },
  // Peru
  { week: 26, region: "Lima", country: "Peru", de: "limeñische Küche (Ceviche, Nikkei)" },
  { week: 27, region: "Cusco", country: "Peru", de: "andine Küche aus Cusco" },
  // Argentina
  { week: 28, region: "Buenos Aires", country: "Argentina", de: "Küche von Buenos Aires (Asado, Empanadas)" },
  { week: 29, region: "Mendoza", country: "Argentina", de: "Küche aus Mendoza (Weinland)" },
  // Chile
  { week: 30, region: "Santiago", country: "Chile", de: "chilenische Küche aus Santiago" },
  { week: 31, region: "Valparaíso", country: "Chile", de: "Küstenküche aus Valparaíso" },
  // Brazil
  { week: 32, region: "São Paulo", country: "Brazil", de: "Küche aus São Paulo" },
  { week: 33, region: "Minas Gerais", country: "Brazil", de: "Küche aus Minas Gerais" },
  { week: 34, region: "Bahia", country: "Brazil", de: "bahianische Küche (afro-brasilianisch)" },
  // Japan
  { week: 35, region: "Tokyo", country: "Japan", de: "Küche aus Tokio" },
  { week: 36, region: "Kyoto", country: "Japan", de: "Kyoto-Küche (Kaiseki)" },
  { week: 37, region: "Osaka", country: "Japan", de: "Osaka-Küche (Streetfood)" },
  { week: 38, region: "Hokkaido", country: "Japan", de: "Hokkaido-Küche (Meeresfrüchte)" },
  // Thailand
  { week: 39, region: "Bangkok", country: "Thailand", de: "Küche aus Bangkok" },
  { week: 40, region: "Chiang Mai", country: "Thailand", de: "nordthailändische Küche (Chiang Mai)" },
  // Malaysia
  { week: 41, region: "Penang", country: "Malaysia", de: "Penang-Küche (Streetfood, Nyonya)" },
  { week: 42, region: "Kuala Lumpur", country: "Malaysia", de: "Küche aus Kuala Lumpur" },
  // Singapore
  { week: 43, region: "Singapore", country: "Singapore", de: "singapurische Küche (Hawker)" },
  // South Korea
  { week: 44, region: "Seoul", country: "South Korea", de: "Küche aus Seoul" },
  { week: 45, region: "Jeonju", country: "South Korea", de: "Jeonju-Küche (Bibimbap, Hansik)" },
  // China
  { week: 46, region: "Shanghai", country: "China", de: "Shanghai-Küche" },
  { week: 47, region: "Sichuan", country: "China", de: "Sichuan-Küche (scharf)" },
  { week: 48, region: "Guangdong", country: "China", de: "kantonesische Küche (Dim Sum)" },
  { week: 49, region: "Xi'an", country: "China", de: "Xi'an-Küche (Nudeln, Streetfood)" },
  // Taiwan
  { week: 50, region: "Taiwan", country: "Taiwan", de: "taiwanesische Küche (Nachtmärkte)" },
  // Vietnam
  { week: 51, region: "Hanoi", country: "Vietnam", de: "Küche aus Hanoi (Pho, Bun Cha)" },
  // Hong Kong
  { week: 52, region: "Hong Kong", country: "Hong Kong", de: "Hongkong-Küche (Cha Chaan Teng)" },
];

/** Look up the region for an ISO week. Wraps modulo so week 53 folds to 1. */
export function getRegionForWeek(week: number): RegionWeek {
  const idx = ((Math.max(week, 1) - 1) % REGION_CALENDAR.length + REGION_CALENDAR.length) %
    REGION_CALENDAR.length;
  return REGION_CALENDAR[idx];
}

/** The region for the given date (defaults to now). */
export function getCurrentRegion(now: Date = new Date()): {
  week: number;
  region: RegionWeek;
} {
  const week = getISOWeek(now);
  return { week, region: getRegionForWeek(week) };
}

/**
 * Build the run brief for a "Best dish from … (region)" galley. Pushes the
 * region into both theme and notes so all 6 candidates center on that region's
 * genuinely iconic dishes (recognisable classics, not fusion or invented
 * dishes). Output language follows `locale` (defaults to German).
 */
export function buildRegionBrief(
  week: number,
  region: RegionWeek,
  locale: "de" | "en" = "de",
): {
  theme: string;
  notes: string;
  locale: "de" | "en";
} {
  if (locale === "en") {
    return {
      theme: `Best dishes from ${region.region}, ${region.country} (Week ${week})`,
      notes: `Each of the 6 recipes is a genuinely iconic, recognisable classic of ${region.region} (${region.country}) — the dishes a local would name first, not fusion or invented dishes. A mix of quick everyday plates, one or two mains, and a signature showpiece. Authentic ingredients and techniques; keep the dish names in their original language where that is how they are known.`,
      locale: "en",
    };
  }
  return {
    theme: `Beste Gerichte aus ${region.region}, ${region.country} (KW ${week})`,
    notes: `Jedes der 6 Rezepte ist ein echtes, wiedererkennbares Klassiker-Gericht aus ${region.region} (${region.de}) — die Gerichte, die Einheimische zuerst nennen würden, keine Fusion- oder erfundenen Gerichte. Mischung aus schnellen Alltagsgerichten, ein bis zwei Hauptgerichten und einem Aushängeschild. Authentische Zutaten und Zubereitung; Gerichtnamen in der Originalsprache belassen, wo sie so bekannt sind.`,
    locale: "de",
  };
}
