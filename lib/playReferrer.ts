/**
 * GAL-444: Google Play Install Referrer parsing (Android attribution).
 *
 * The native Play Install Referrer API returns the `referrer` string that was
 * attached to the Play Store link which drove the install — for UTM-tagged
 * marketing links that's `utm_source=…&utm_medium=…&utm_campaign=…`. We parse
 * it into the same fields the web first-touch UTM capture uses (see
 * lib/attribution.ts / migration 048), so Android installs land in the same
 * attribution model + dashboard.
 */

export interface PlayReferrerUtm {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
}

const EMPTY: PlayReferrerUtm = {
  source: null,
  medium: null,
  campaign: null,
  content: null,
  term: null,
};

/**
 * Parse a Play Install Referrer string into UTM fields. The string is a
 * query-string-style `utm_source=x&utm_medium=y`; some Play deliveries arrive
 * URL-encoded (`utm_source%3Dx%26…`), so decode once if it looks encoded.
 */
export function parsePlayReferrer(raw: string | null | undefined): PlayReferrerUtm {
  if (!raw) return { ...EMPTY };
  let str = raw;
  if (/%3D|%26/i.test(str)) {
    try {
      str = decodeURIComponent(str);
    } catch {
      // keep the raw string if it isn't valid percent-encoding
    }
  }
  const p = new URLSearchParams(str);
  const get = (k: string) => {
    const v = p.get(k);
    return v && v.length > 0 ? v : null;
  };
  return {
    source: get("utm_source"),
    medium: get("utm_medium"),
    campaign: get("utm_campaign"),
    content: get("utm_content"),
    term: get("utm_term"),
  };
}
