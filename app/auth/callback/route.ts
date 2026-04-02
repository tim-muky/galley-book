import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/library";
  // Prevent open-redirect: only allow relative paths that start with a single slash.
  // e.g. "//evil.com" or "https://evil.com" would otherwise redirect off-site.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/library";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
