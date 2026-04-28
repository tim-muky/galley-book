/**
 * Build-time guard for GAL-172.
 *
 * /share/<token> must be served without a next-intl locale prefix because
 * Bring!'s server-side scraper fetches the canonical URL and does not follow
 * locale redirects. If proxy.ts ever stops bypassing /share, the
 * "Add to Shopping List" button silently breaks. Fail the build instead.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const proxyPath = resolve(__dirname, "..", "proxy.ts");
const source = readFileSync(proxyPath, "utf8");

if (!/pathname\.startsWith\(["']\/share["']\)/.test(source)) {
  console.error(
    "[check-share-bypass] proxy.ts no longer bypasses /share — this breaks the Bring! shopping-list button (GAL-172)."
  );
  process.exit(1);
}
