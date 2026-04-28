import type { ImageSource, ParsedVia } from "@/lib/recipe-prompts";

export type { ImageSource, ParsedVia };

export interface FetchResult {
  content: string;
  imageUrl: string | null;
  imageCandidates: string[];
  parsedVia: ParsedVia;
  imageSource: ImageSource;
  error?: string;
}
