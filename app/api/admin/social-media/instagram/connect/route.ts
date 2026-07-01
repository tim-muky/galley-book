import { requireAdmin } from "@/lib/auth/admin";
import { INSTAGRAM_SCOPES, instagramRedirectUri } from "@/lib/marketing/instagram-auth";
import { NextResponse } from "next/server";

// Kicks off the Instagram Login OAuth consent. The Instagram App ID / redirect
// URI must be configured on the app's "Instagram API with Instagram Login"
// setup. Full-page navigation from the admin Connect button.
export async function GET(request: Request) {
  await requireAdmin();

  const clientId = process.env.INSTAGRAM_APP_ID;
  if (!clientId) {
    return NextResponse.json({ error: "INSTAGRAM_APP_ID not set" }, { status: 500 });
  }

  const url = new URL(request.url);
  const state = crypto.randomUUID();

  const authorize = new URL("https://www.instagram.com/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", instagramRedirectUri(url.origin));
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", INSTAGRAM_SCOPES);
  authorize.searchParams.set("state", state);

  const res = NextResponse.redirect(authorize.toString());
  res.cookies.set("instagram_oauth_state", state, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
