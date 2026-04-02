import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  /*
   * Run on every path except Next.js internals and static assets.
   * updateSession() refreshes the Supabase auth token and redirects
   * unauthenticated users away from protected routes.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
