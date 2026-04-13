import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") ?? "/library";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/library";

  // --- diagnostic helpers ---
  const requestCookies = request.cookies.getAll();
  const cookieNames = requestCookies.map((c) => c.name);
  const hasVerifier = cookieNames.some((n) => n.includes("code-verifier"));

  function debugPage(title: string, lines: string[], continueUrl: string | null): NextResponse {
    const items = lines.map((l) => `<li>${l}</li>`).join("");
    const action = continueUrl
      ? `<p><a href="${continueUrl}" style="font-size:18px;font-weight:bold">→ Continue to app</a></p>`
      : `<p><a href="/auth/login">← Back to login</a></p>`;
    const body = `<!DOCTYPE html><html><body style="font-family:monospace;padding:24px;max-width:700px;line-height:1.8">
      <h2>${title}</h2><ul>${items}</ul>${action}</body></html>`;
    return new NextResponse(body, { headers: { "Content-Type": "text/html" } });
  }

  if (!code) {
    return debugPage("❌ NO CODE IN URL", [
      `URL: ${url.toString()}`,
      `Cookies (${cookieNames.length}): ${cookieNames.join(", ") || "(none)"}`,
    ], null);
  }

  const setCookieNames: string[] = [];
  const sessionCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => requestCookies,
        setAll: (toSet) => {
          toSet.forEach(({ name, value, options }) => {
            setCookieNames.push(name);
            sessionCookies.push({ name, value, options: options as Record<string, unknown> });
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  const lines = [
    `Code (first 8): ${code.substring(0, 8)}…`,
    `Verifier cookie present: ${hasVerifier ? "✅ yes" : "❌ NO — this is the problem"}`,
    `Request cookies (${cookieNames.length}): ${cookieNames.join(", ") || "(none)"}`,
    `Exchange error: ${error?.message ?? "none"}`,
    `Session returned: ${data?.session ? `✅ yes (${data.session.user.email ?? data.session.user.id})` : "❌ no"}`,
    `Cookies to write (${setCookieNames.length}): ${setCookieNames.join(", ") || "(none)"}`,
  ];

  const debugResponse = debugPage(
    error ? "❌ Exchange FAILED" : "✅ Exchange SUCCEEDED",
    lines,
    error ? null : next
  );

  // Attach session cookies to the debug page so "Continue" actually works
  if (!error) {
    sessionCookies.forEach(({ name, value, options }) => {
      debugResponse.cookies.set(
        name,
        value,
        options as Parameters<typeof debugResponse.cookies.set>[2]
      );
    });
  }

  return debugResponse;
}
