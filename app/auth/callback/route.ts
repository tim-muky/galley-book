import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { createServiceClient } from "@/lib/supabase/service";
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from "@/lib/attribution";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeRedirectPath(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/en/auth/login?error=no_code", request.url));
  }

  const redirectResponse = NextResponse.redirect(new URL(next, request.url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            redirectResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/en/auth/login?error=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  // Best-effort first-touch attribution (GAL-393). Never block the auth flow.
  const attribution = parseAttributionCookie(request.cookies.get(ATTRIBUTION_COOKIE)?.value);
  const userId = data.user?.id;
  if (attribution && userId) {
    try {
      const service = createServiceClient();
      await service
        .from("users")
        .update({
          utm_source: attribution.source,
          utm_medium: attribution.medium,
          utm_campaign: attribution.campaign,
          utm_content: attribution.content,
          utm_term: attribution.term,
          ref_referrer: attribution.referrer,
          ref_landing_path: attribution.landingPath,
          attribution_captured_at: new Date().toISOString(),
        })
        .eq("id", userId)
        // First-touch: only write if never attributed before.
        .is("attribution_captured_at", null);
    } catch (e) {
      logger.error("attribution.persist_failed", {
        userId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
    // Consume the cookie regardless of outcome.
    const isProd = url.hostname.endsWith("galleybook.com");
    redirectResponse.cookies.set(ATTRIBUTION_COOKIE, "", {
      path: "/",
      maxAge: 0,
      ...(isProd ? { domain: ".galleybook.com" } : {}),
    });
  }

  return redirectResponse;
}
