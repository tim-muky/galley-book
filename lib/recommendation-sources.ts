/**
 * Curated set of cooking sources known to parse well in galleybook.
 * Used by /api/recommendations as the default search corpus when the
 * user hasn't specified a cuisine or ingredient.
 *
 * Append-only — extend this list over time as new sources are
 * verified to parse reliably (good Schema.org JSON-LD coverage,
 * direct recipe URLs, public pages). Removing entries is fine if a
 * source becomes paywalled or starts hiding structured data.
 */
export const RECOMMENDED_SOURCES: readonly string[] = [
  "bonappetit.com",
  "seriouseats.com",
  "food52.com",
  "smittenkitchen.com",
  "thekitchn.com",
  "minimalistbaker.com",
  "halfbakedharvest.com",
  "recipetineats.com",
  "onceuponachef.com",
  "budgetbytes.com",
  "epicurious.com",
  "bbcgoodfood.com",
];
