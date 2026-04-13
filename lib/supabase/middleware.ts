import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect app routes — allow auth routes and public share pages
  const isAuthRoute = request.nextUrl.pathname.startsWith("/auth");
  const isShareRoute = request.nextUrl.pathname.startsWith("/share");
  const isApiRoute = request.nextUrl.pathname.startsWith("/api");

  if (!user && !isAuthRoute && !isShareRoute && !isApiRoute) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  return supabaseResponse;
}
