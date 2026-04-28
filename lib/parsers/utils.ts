/** Normalize protocol-relative URLs to https */
export function normalizeImageUrl(raw: string): string | null {
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("http")) return raw;
  return null;
}

/** Extract og:image or twitter:image from raw HTML */
export function extractImageUrl(html: string): string | null {
  const patterns = [
    /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    /name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const normalized = normalizeImageUrl(match[1]);
      if (normalized) return normalized;
    }
  }
  return null;
}

/** Download an image and return base64 + mime so it can be passed as Gemini inlineData.
 *  Cap at 5 MB to keep us inside model + lambda limits. */
export async function fetchInlineImage(
  url: string
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const isInstagramCdn = url.includes("cdninstagram.com") || url.includes("fbcdn.net");
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GalleyBook/1.0; +https://galleybook.com)",
        ...(isInstagramCdn ? { Referer: "https://www.instagram.com/" } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > 5 * 1024 * 1024) return null;
    const mimeType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];
    return { data: Buffer.from(buffer).toString("base64"), mimeType };
  } catch {
    return null;
  }
}

/** Resolve with the first non-null result from a list of promises, or null
 *  if all resolve to null. Used to race independent fallback strategies and
 *  return whichever produces usable content first. */
export async function firstUsable<T>(promises: Promise<T | null>[]): Promise<T | null> {
  return new Promise((resolve) => {
    let pending = promises.length;
    if (pending === 0) {
      resolve(null);
      return;
    }
    let settled = false;
    for (const p of promises) {
      p.then((value) => {
        if (settled) return;
        if (value !== null && value !== undefined) {
          settled = true;
          resolve(value);
          return;
        }
        pending -= 1;
        if (pending === 0 && !settled) {
          settled = true;
          resolve(null);
        }
      }).catch(() => {
        if (settled) return;
        pending -= 1;
        if (pending === 0 && !settled) {
          settled = true;
          resolve(null);
        }
      });
    }
  });
}
