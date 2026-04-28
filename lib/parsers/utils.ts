/** Normalize image URLs to absolute https. Resolves protocol-relative
 *  (`//cdn/img.jpg`) and root- or path-relative (`/img.jpg`, `img.jpg`)
 *  forms when a page URL is provided. Returns null only for genuinely
 *  unparseable input. */
export function normalizeImageUrl(raw: string, pageUrl?: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!pageUrl) return null;
  try {
    return new URL(trimmed, pageUrl).toString();
  } catch {
    return null;
  }
}

/** Extract a hero image URL from raw HTML.
 *  Tries og:image / twitter:image / og:image:url / og:image:secure_url /
 *  link rel=image_src first, then falls back to the first reasonably-sized
 *  `<img>` inside `<article>`, `<main>`, or `<picture>` (GAL-179). */
export function extractImageUrl(html: string, pageUrl?: string): string | null {
  const metaPatterns = [
    /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    /property=["']og:image:url["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']og:image:url["']/i,
    /property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']og:image:secure_url["']/i,
    /name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i,
    /<link[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/i,
    /<link[^>]*href=["']([^"']+)["'][^>]*rel=["']image_src["']/i,
  ];
  for (const pattern of metaPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const normalized = normalizeImageUrl(match[1], pageUrl);
      if (normalized) return normalized;
    }
  }

  // Last resort: first <img> inside <article>, <main>, or <picture>. Skip
  // tracking pixels by requiring width/height ≥ 200 when the attributes
  // are present; otherwise accept the first match.
  const containerPatterns = [
    /<article[\s\S]*?<\/article>/i,
    /<main[\s\S]*?<\/main>/i,
    /<picture[\s\S]*?<\/picture>/i,
  ];
  const imgPattern = /<img[^>]*>/gi;
  for (const containerPattern of containerPatterns) {
    const container = html.match(containerPattern)?.[0];
    if (!container) continue;
    const imgs = container.match(imgPattern) ?? [];
    for (const img of imgs) {
      const widthAttr = img.match(/\bwidth=["']?(\d+)/i)?.[1];
      const heightAttr = img.match(/\bheight=["']?(\d+)/i)?.[1];
      if (widthAttr && Number(widthAttr) < 200) continue;
      if (heightAttr && Number(heightAttr) < 200) continue;
      const src =
        img.match(/\bsrc=["']([^"']+)["']/i)?.[1] ??
        img.match(/\bdata-src=["']([^"']+)["']/i)?.[1];
      if (!src) continue;
      const normalized = normalizeImageUrl(src, pageUrl);
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
