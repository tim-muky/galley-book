/**
 * GAL-439: Apple Search Ads AdServices attribution.
 *
 * The native app obtains an attribution token on-device (AAAttribution) and
 * sends it to us; we resolve it server-side against Apple's AdServices API.
 * Keeping resolution on the server means the short-lived token never has to be
 * trusted client-side and the campaign/keyword mapping stays in one place.
 *
 * Docs: https://developer.apple.com/documentation/ad_services
 */

const ADSERVICES_ENDPOINT = "https://api-adservices.apple.com/api/v1/";

/** Apple's resolved attribution payload. `attribution:false` ⇒ organic install. */
export interface AdServicesAttribution {
  attribution: boolean;
  orgId: number | null;
  campaignId: number | null;
  conversionType: string | null;
  clickDate: string | null;
  adGroupId: number | null;
  countryOrRegion: string | null;
  keywordId: number | null;
  adId: number | null;
}

export type AdServicesResult =
  | { status: "ok"; data: AdServicesAttribution }
  // Apple hasn't registered the install yet — token valid but not resolvable.
  // The caller should retry shortly (propagation is usually seconds).
  | { status: "pending" }
  // Token malformed/expired (>24h) — give up, don't retry.
  | { status: "invalid" }
  | { status: "error"; httpStatus: number };

/**
 * Resolve an AdServices attribution token. Network/HTTP only — no DB writes.
 *
 * Apple's contract:
 *   - 200 → JSON attribution payload (attribution:false for organic)
 *   - 404 → token not yet resolvable; retry with backoff
 *   - 400 → invalid/expired token; do not retry
 */
export async function resolveAdServicesToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AdServicesResult> {
  let res: Response;
  try {
    res = await fetchImpl(ADSERVICES_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: token,
    });
  } catch {
    return { status: "error", httpStatus: 0 };
  }

  if (res.status === 404) return { status: "pending" };
  if (res.status === 400) return { status: "invalid" };
  if (!res.ok) return { status: "error", httpStatus: res.status };

  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    return { status: "error", httpStatus: res.status };
  }

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;

  return {
    status: "ok",
    data: {
      attribution: json.attribution === true,
      orgId: num(json.orgId),
      campaignId: num(json.campaignId),
      conversionType: str(json.conversionType),
      clickDate: str(json.clickDate),
      adGroupId: num(json.adGroupId),
      countryOrRegion: str(json.countryOrRegion),
      keywordId: num(json.keywordId),
      adId: num(json.adId),
    },
  };
}
