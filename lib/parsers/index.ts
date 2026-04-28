import type { FetchResult } from "./types";
import { isInstagramUrl, parseInstagram } from "./instagram";
import { isYouTubeUrl, parseYouTube } from "./youtube";
import { isTikTokUrl, parseTikTok } from "./tiktok";
import { parseWebsite } from "./website";

export type { FetchResult } from "./types";
export { cacheInstagramImage } from "./instagram";
export { fetchInlineImage } from "./utils";

/** Dispatcher — picks the right parser by URL pattern.
 *  Order matters: Instagram and YouTube share the "social media" space and
 *  must be detected before falling through to the generic website parser. */
export async function fetchPageContent(url: string): Promise<FetchResult> {
  if (isInstagramUrl(url)) return parseInstagram(url);
  if (isYouTubeUrl(url)) return parseYouTube(url);
  if (isTikTokUrl(url)) return parseTikTok(url);
  return parseWebsite(url);
}
