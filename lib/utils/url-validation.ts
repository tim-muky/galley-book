/**
 * URL safety validation — used before any server-side fetch of a user-supplied URL.
 * Guards against SSRF (Server-Side Request Forgery) attacks that could reach
 * internal services, cloud metadata endpoints, or private networks.
 */

import { lookup } from "node:dns/promises";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  // AWS / GCP / Azure metadata endpoints
  "169.254.169.254",
  "fd00:ec2::254",
]);

// Private / reserved IPv4 ranges
const PRIVATE_IPV4 = [
  /^127\./,          // loopback
  /^10\./,           // RFC 1918
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC 1918
  /^192\.168\./,     // RFC 1918
  /^169\.254\./,     // link-local / cloud metadata
  /^0\./,            // "this" network
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT
];

// Private / reserved IPv6 prefixes
const PRIVATE_IPV6 = [
  /^::1$/i,          // loopback
  /^fc/i,            // unique local
  /^fd/i,            // unique local
  /^fe[89ab]/i,      // link-local
];

function isPrivateIp(address: string): boolean {
  const lower = address.toLowerCase();
  if (PRIVATE_IPV4.some((p) => p.test(lower))) return true;
  if (PRIVATE_IPV6.some((p) => p.test(lower))) return true;
  return false;
}

/**
 * Returns true only if `urlString` is a syntactically safe, public HTTP(S) URL.
 *
 * NOTE: this is the cheap synchronous check — it inspects the literal hostname
 * only. Use {@link isSafeUrlAsync} (or {@link assertSafeFetchUrl}) before any
 * actual fetch, which additionally resolves DNS and rejects hosts whose A/AAAA
 * records point at private/reserved space.
 */
export function isSafeUrl(urlString: string): boolean {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }

  // Only HTTP and HTTPS
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(host)) return false;
  if (isPrivateIp(host)) return false;

  return true;
}

/**
 * SSRF-safe URL check that also performs DNS resolution and rejects any
 * hostname that resolves to a private / loopback / link-local address.
 *
 * Defends against DNS rebinding: an attacker could register a public domain
 * whose A record returns 169.254.169.254. {@link isSafeUrl} alone would let
 * that through; this resolves the host and re-checks every returned IP.
 *
 * Note: there is still a TOCTOU window between this check and the subsequent
 * `fetch()`. For full protection, callers should fetch using a custom HTTP
 * agent that pins resolution to the IP returned here.
 */
export type UrlSafetyResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "scheme" | "private" | "unresolvable" };

export async function checkUrlSafety(urlString: string): Promise<UrlSafetyResult> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "scheme" };
  }

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || isPrivateIp(host)) {
    return { ok: false, reason: "private" };
  }

  // Literal IPs already validated above.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return { ok: true };

  try {
    const addresses = await lookup(host, { all: true });
    if (addresses.length === 0) return { ok: false, reason: "unresolvable" };
    if (addresses.some((a) => isPrivateIp(a.address))) return { ok: false, reason: "private" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "unresolvable" };
  }
}

export async function isSafeUrlAsync(urlString: string): Promise<boolean> {
  return (await checkUrlSafety(urlString)).ok;
}
