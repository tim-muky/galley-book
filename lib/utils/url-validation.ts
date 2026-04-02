/**
 * URL safety validation — used before any server-side fetch of a user-supplied URL.
 * Guards against SSRF (Server-Side Request Forgery) attacks that could reach
 * internal services, cloud metadata endpoints, or private networks.
 */

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

/**
 * Returns true only if `urlString` is a safe, public HTTP(S) URL.
 * Returns false for any private IP, loopback address, cloud metadata
 * endpoint, non-HTTP scheme, or malformed URL.
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

  for (const pattern of PRIVATE_IPV4) {
    if (pattern.test(host)) return false;
  }

  for (const pattern of PRIVATE_IPV6) {
    if (pattern.test(host)) return false;
  }

  return true;
}
