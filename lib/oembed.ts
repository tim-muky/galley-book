/**
 * oEmbed helpers — public, unauthenticated endpoints for fetching
 * post/video metadata (author, thumbnail, title) from social platforms.
 */

type Provider = "instagram" | "youtube" | "tiktok";

const ENDPOINTS: Record<Provider, (url: string) => string> = {
  instagram: (u) => `https://api.instagram.com/oembed/?url=${encodeURIComponent(u)}&fields=author_name`,
  youtube: (u) => `https://www.youtube.com/oembed?url=${encodeURIComponent(u)}&format=json`,
  tiktok: (u) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`,
};

export interface OEmbedData {
  author_name?: string;
  author_url?: string;
  title?: string;
  thumbnail_url?: string;
}

/** Fetch raw oEmbed payload for a URL. Returns null on any error or non-2xx. */
export async function fetchOEmbed(
  provider: Provider,
  url: string,
  timeoutMs = 4000
): Promise<OEmbedData | null> {
  try {
    const res = await fetch(ENDPOINTS[provider](url), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as OEmbedData;
  } catch {
    return null;
  }
}

/** Convenience: extract a normalised handle/author for the given URL. */
export async function fetchAuthor(provider: Provider, url: string): Promise<string | null> {
  const data = await fetchOEmbed(provider, url);
  if (!data) return null;

  if (provider === "tiktok") {
    // TikTok's author_url is `https://www.tiktok.com/@handle` — prefer that
    const handleMatch = (data.author_url ?? "").match(/tiktok\.com\/@([^/?#]+)/);
    if (handleMatch?.[1]) return `@${handleMatch[1]}`;
  }

  return typeof data.author_name === "string" && data.author_name ? data.author_name : null;
}
