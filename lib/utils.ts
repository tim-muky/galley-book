import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Escape `%`, `_`, and `\` so user-typed search input is treated as literal
 * characters by Postgres ILIKE / LIKE — otherwise "100%" matches everything.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&");
}
