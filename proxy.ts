import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { routing } from "@/i18n/routing";

const LANDING_HOSTS = new Set(["galleybook.com", "www.galleybook.com"]);

const intlMiddleware = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;

  // Landing domain — rewrite to /landing, pass API routes through
  if (LANDING_HOSTS.has(host)) {
    if (pathname.startsWith("/api/")) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/landing" : `/landing${pathname}`;
    return NextResponse.rewrite(url);
  }

  // Skip intl routing for paths that never need a locale prefix
  if (
    pathname.startsWith("/api/") ||
    pathname === "/auth/callback" ||
    pathname.startsWith("/landing") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/impressum") ||
    pathname.startsWith("/datenschutz") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms")
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

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
