/**
 * Seasonal vegetable calendar for the "Veggie of the Week" Campaign Studio flow.
 *
 * One vegetable per ISO calendar week (1–52), anchored to the German
 * Saisonkalender (regional-saisonal.de / BZfE / NABU) since galleybook's
 * primary market is DACH. Each entry is placed in the week where that
 * vegetable is genuinely in season in Central Europe — deep-winter hardy
 * and storage crops at both ends, the full summer abundance in the middle.
 *
 * `de` is the user-facing name (recipes default to German); `en` is the
 * English gloss carried into the AI brief for clarity.
 */

export type VeggieSeason = "Winter" | "Frühling" | "Sommer" | "Herbst";

export interface VeggieWeek {
  /** ISO week number, 1–52 */
  week: number;
  /** German name — the hero ingredient as users see it */
  de: string;
  /** English gloss for the AI brief */
  en: string;
  season: VeggieSeason;
}

export const VEGGIE_CALENDAR: VeggieWeek[] = [
  { week: 1, de: "Grünkohl", en: "kale", season: "Winter" },
  { week: 2, de: "Rosenkohl", en: "Brussels sprouts", season: "Winter" },
  { week: 3, de: "Feldsalat", en: "lamb's lettuce", season: "Winter" },
  { week: 4, de: "Topinambur", en: "Jerusalem artichoke", season: "Winter" },
  { week: 5, de: "Pastinake", en: "parsnip", season: "Winter" },
  { week: 6, de: "Porree", en: "leek", season: "Winter" },
  { week: 7, de: "Rote Bete", en: "beetroot", season: "Winter" },
  { week: 8, de: "Wirsing", en: "savoy cabbage", season: "Winter" },
  { week: 9, de: "Knollensellerie", en: "celeriac", season: "Frühling" },
  { week: 10, de: "Chicorée", en: "chicory", season: "Frühling" },
  { week: 11, de: "Bärlauch", en: "wild garlic", season: "Frühling" },
  { week: 12, de: "Spinat", en: "spinach", season: "Frühling" },
  { week: 13, de: "Radieschen", en: "radish", season: "Frühling" },
  { week: 14, de: "Rhabarber", en: "rhubarb", season: "Frühling" },
  { week: 15, de: "Frühlingszwiebeln", en: "spring onions", season: "Frühling" },
  { week: 16, de: "Mangold", en: "Swiss chard", season: "Frühling" },
  { week: 17, de: "Spargel", en: "asparagus", season: "Frühling" },
  { week: 18, de: "Kohlrabi", en: "kohlrabi", season: "Frühling" },
  { week: 19, de: "Kopfsalat", en: "butterhead lettuce", season: "Frühling" },
  { week: 20, de: "Mairübchen", en: "May turnip", season: "Frühling" },
  { week: 21, de: "Zuckerschoten", en: "sugar snap peas", season: "Frühling" },
  { week: 22, de: "Frühkartoffeln", en: "new potatoes", season: "Frühling" },
  { week: 23, de: "Erbsen", en: "garden peas", season: "Sommer" },
  { week: 24, de: "Dicke Bohnen", en: "broad beans", season: "Sommer" },
  { week: 25, de: "Fenchel", en: "fennel", season: "Sommer" },
  { week: 26, de: "Gurke", en: "cucumber", season: "Sommer" },
  { week: 27, de: "Zucchini", en: "zucchini", season: "Sommer" },
  { week: 28, de: "Brokkoli", en: "broccoli", season: "Sommer" },
  { week: 29, de: "Buschbohnen", en: "green beans", season: "Sommer" },
  { week: 30, de: "Tomate", en: "tomato", season: "Sommer" },
  { week: 31, de: "Paprika", en: "bell pepper", season: "Sommer" },
  { week: 32, de: "Aubergine", en: "eggplant", season: "Sommer" },
  { week: 33, de: "Zuckermais", en: "sweetcorn", season: "Sommer" },
  { week: 34, de: "Blumenkohl", en: "cauliflower", season: "Sommer" },
  { week: 35, de: "Staudensellerie", en: "celery", season: "Sommer" },
  { week: 36, de: "Möhren", en: "carrots", season: "Herbst" },
  { week: 37, de: "Kürbis", en: "pumpkin", season: "Herbst" },
  { week: 38, de: "Rotkohl", en: "red cabbage", season: "Herbst" },
  { week: 39, de: "Spitzkohl", en: "pointed cabbage", season: "Herbst" },
  { week: 40, de: "Weißkohl", en: "white cabbage", season: "Herbst" },
  { week: 41, de: "Chinakohl", en: "napa cabbage", season: "Herbst" },
  { week: 42, de: "Romanesco", en: "romanesco", season: "Herbst" },
  { week: 43, de: "Endivie", en: "endive", season: "Herbst" },
  { week: 44, de: "Süßkartoffel", en: "sweet potato", season: "Herbst" },
  { week: 45, de: "Pak Choi", en: "pak choi", season: "Herbst" },
  { week: 46, de: "Rucola", en: "arugula", season: "Herbst" },
  { week: 47, de: "Winterportulak", en: "winter purslane", season: "Herbst" },
  { week: 48, de: "Zwiebel", en: "onion", season: "Winter" },
  { week: 49, de: "Champignon", en: "button mushroom", season: "Winter" },
  { week: 50, de: "Schwarzwurzel", en: "salsify", season: "Winter" },
  { week: 51, de: "Steckrübe", en: "swede", season: "Winter" },
  { week: 52, de: "Knoblauch", en: "garlic", season: "Winter" },
];

/**
 * ISO 8601 week number (1–53). Weeks start Monday; week 1 contains the
 * year's first Thursday.
 */
export function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Thursday of the current week decides the year.
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

/** Look up the vegetable for an ISO week. Week 53 folds back onto 52. */
export function getVeggieForWeek(week: number): VeggieWeek {
  const clamped = Math.min(Math.max(week, 1), 52);
  return VEGGIE_CALENDAR[clamped - 1];
}

/** The vegetable in season for the given date (defaults to now). */
export function getCurrentVeggie(now: Date = new Date()): {
  week: number;
  veggie: VeggieWeek;
} {
  const week = getISOWeek(now);
  return { week, veggie: getVeggieForWeek(week) };
}

const SEASON_EN: Record<VeggieSeason, string> = {
  Winter: "winter",
  Frühling: "spring",
  Sommer: "summer",
  Herbst: "autumn",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Build the run brief for a veggie-of-the-week galley. Mirrors the manual
 * "New Galley of the Week" brief so the rest of the pipeline is unchanged —
 * the hero vegetable is pushed into both theme and notes so all 6
 * candidates center on it. Output language follows `locale` (defaults to
 * German, galleybook's primary market).
 */
export function buildVeggieBrief(
  week: number,
  veggie: VeggieWeek,
  locale: "de" | "en" = "de",
): {
  theme: string;
  notes: string;
  locale: "de" | "en";
} {
  if (locale === "en") {
    return {
      theme: `${capitalize(veggie.en)} — Veggie of the Week (Week ${week})`,
      notes: `Every one of the 6 recipes puts ${veggie.en} front and centre as the clear hero ingredient — in season in ${SEASON_EN[veggie.season]}. A mix of quick weeknight dishes, mains, and one showpiece. Varied techniques, no near-duplicates.`,
      locale: "en",
    };
  }
  return {
    theme: `${veggie.de} — Gemüse der Woche (KW ${week})`,
    notes: `Jedes der 6 Rezepte stellt ${veggie.de} (${veggie.en}) als klare Hauptzutat in den Mittelpunkt — saisonal passend im ${veggie.season}. Mischung aus schnellen Alltagsgerichten, Hauptgerichten und einem Highlight. Abwechslungsreiche Zubereitungen, keine Dopplungen.`,
    locale: "de",
  };
}
