/**
 * First-touch signup attribution (GAL-393 prerequisite).
 *
 * Captures UTM params on the landing page into a first-party cookie scoped to
 * `.galleybook.com`, so it survives the cross-subdomain hop to the app + the
 * Google OAuth round-trip. The auth callback reads this cookie and writes it
 * onto the user row (first-touch — never overwritten).
 *
 * Consent-gated: only call `captureAttribution()` after the user accepts
 * cookies (DSGVO/TTDSG — consistent with the Meta Pixel gating).
 */

export const ATTRIBUTION_COOKIE = "gb_attr";

export interface Attribution {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  referrer: string | null;
  landingPath: string | null;
}

/**
 * Client-side: read UTM params from the current URL and persist a first-touch
 * attribution cookie. No-op if a cookie already exists (first touch wins) or if
 * there's no campaign signal to capture.
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;

  const already = document.cookie
    .split("; ")
    .some((c) => c.startsWith(`${ATTRIBUTION_COOKIE}=`));
  if (already) return;

  const p = new URLSearchParams(window.location.search);
  const source = p.get("utm_source");
  const campaign = p.get("utm_campaign");
  // Only capture when there's an actual campaign signal — don't write a cookie
  // for organic/direct visits.
  if (!source && !campaign) return;

  const data: Attribution = {
    source,
    medium: p.get("utm_medium"),
    campaign,
    content: p.get("utm_content"),
    term: p.get("utm_term"),
    referrer: document.referrer || null,
    landingPath: window.location.pathname + window.location.search,
  };

  const value = encodeURIComponent(JSON.stringify(data));
  const isProd = window.location.hostname.endsWith("galleybook.com");
  const domain = isProd ? "; domain=.galleybook.com" : "";
  const maxAge = 60 * 60 * 24 * 90; // 90 days
  // SameSite=Lax: the cookie must ride along on the top-level OAuth redirect
  // back to app.galleybook.com so the callback can read it.
  document.cookie = `${ATTRIBUTION_COOKIE}=${value}; path=/; max-age=${maxAge}; samesite=lax${domain}`;
}

/** Server-side: parse the raw cookie value. Returns null on any malformed input. */
export function parseAttributionCookie(raw: string | undefined): Attribution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<Attribution>;
    return {
      source: parsed.source ?? null,
      medium: parsed.medium ?? null,
      campaign: parsed.campaign ?? null,
      content: parsed.content ?? null,
      term: parsed.term ?? null,
      referrer: parsed.referrer ?? null,
      landingPath: parsed.landingPath ?? null,
    };
  } catch {
    return null;
  }
}
