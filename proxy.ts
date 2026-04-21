import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Hosts that serve the marketing landing page
const LANDING_HOSTS = new Set(["galleybook.com", "www.galleybook.com"]);

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;

  if (LANDING_HOSTS.has(host)) {
    // API routes pass through without rewrite (waitlist endpoint, etc.)
    if (pathname.startsWith("/api/")) return NextResponse.next();

    // Rewrite everything else to /landing
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/landing" : `/landing${pathname}`;
    return NextResponse.rewrite(url);
  }

  // App subdomain (app.galleybook.com) + local dev — enforce Supabase auth
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
