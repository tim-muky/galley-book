// Validates that a redirect target stays within the app origin.
// Prevents open-redirect attacks via backslash, tab, or protocol-relative bypasses.
const SAFE_PATH = /^\/[a-zA-Z0-9\-_.~!$&'()*+,;=:@/?#%]*$/;

export function safeRedirectPath(next: string | null | undefined, fallback = "/library"): string {
  if (!next) return fallback;
  try {
    const url = new URL(next, "https://galleybook.com");
    if (url.origin !== "https://galleybook.com") return fallback;
    if (!SAFE_PATH.test(next)) return fallback;
    return next;
  } catch {
    return fallback;
  }
}
