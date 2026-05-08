import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { routing } from "@/i18n/routing";

const LANDING_HOSTS = new Set(["galleybook.com", "www.galleybook.com"]);

// Anonymous, locale-agnostic legal pages. Served as-is on every host —
// no rewrites, no locale routing, no Supabase session refresh.
const LEGAL_PATHS = ["/privacy", "/terms", "/impressum", "/datenschutz"];
const isLegalPath = (p: string) =>
  LEGAL_PATHS.some((prefix) => p.startsWith(prefix));

const intlMiddleware = createMiddleware(routing);

// Static asset paths that must NEVER be touched by the proxy. The matcher in
// `proxyConfig` already excludes them, but in Next 16's proxy.ts the matcher
// has bitten us before — keeping a defensive runtime guard so a regression
// in the matcher can't 404 the entire build's CSS/JS or /public assets.
const STATIC_ASSET_PATTERN =
  /\.(?:css|js|map|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|json|xml|txt|webmanifest)$/i;

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.png" ||
    pathname === "/manifest.json" ||
    STATIC_ASSET_PATTERN.test(pathname)
  );
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;

  // Defensive: never rewrite or run intl on static assets — they live at the
  // exact path Vercel serves them from. See note above.
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // Legal pages: identical handling on every host. No session refresh —
  // these are public, anonymous pages.
  if (isLegalPath(pathname)) {
    return NextResponse.next();
  }

  // Landing domain — rewrite everything else to /landing/*. APIs pass through.
  if (LANDING_HOSTS.has(host)) {
    if (pathname.startsWith("/api/")) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/landing" : `/landing${pathname}`;
    return NextResponse.rewrite(url);
  }

  // Skip intl routing for paths that never need a locale prefix.
  // /share MUST stay bypassed: Bring!'s server-side parser fetches the canonical
  // /share/<token> URL and does not follow the locale redirect — removing it
  // breaks the "Add to Shopping List" button (see GAL-172).
  // /.well-known MUST stay bypassed: Apple's AASA fetcher demands the exact
  // canonical URL and does not follow locale redirects.
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/.well-known/") ||
    pathname === "/auth/callback" ||
    pathname.startsWith("/landing") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/share")
  ) {
    return updateSession(request);
  }

  // Apply next-intl locale routing, then refresh Supabase session cookies
  const intlResponse = intlMiddleware(request);

  // If intl redirected (e.g. added locale prefix), honour it immediately
  if (intlResponse.status !== 200) return intlResponse;

  return updateSession(request, intlResponse);
}

export const proxyConfig = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
