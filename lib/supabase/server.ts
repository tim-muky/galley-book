import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

/**
 * Server-side Supabase client. Authenticates via cookies (web) and falls
 * back to `Authorization: Bearer <jwt>` when the request carries one
 * (native iOS app — see galley-book-native/lib/api.ts). The Bearer path is
 * forwarded through `global.headers` so PostgREST sees the user JWT and RLS
 * policies apply normally.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const authHeader = headerStore.get("authorization") ?? headerStore.get("Authorization");

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server component — cookies can't be set here; middleware handles refresh
          }
        },
      },
      // Forward an inbound Bearer token to PostgREST and to auth.getUser(),
      // so native callers without cookies still authenticate correctly.
      ...(authHeader?.toLowerCase().startsWith("bearer ")
        ? { global: { headers: { Authorization: authHeader } } }
        : {}),
    }
  );
}
