import { requireAdmin } from "@/lib/auth/admin";
import { NextResponse } from "next/server";

// Scopes must match what's enabled on the app in the TikTok developer portal.
// user.info.basic → display name for "Connected as …"; video.publish → Direct Post.
const SCOPES = process.env.TIKTOK_SCOPES || "user.info.basic,video.publish";

function redirectUri(origin: string): string {
  return process.env.TIKTOK_REDIRECT_URI || `${origin}/api/admin/social-media/tiktok/callback`;
}

export async function GET(request: Request) {
  await requireAdmin();

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    return NextResponse.json({ error: "TIKTOK_CLIENT_KEY not set" }, { status: 500 });
  }

  const url = new URL(request.url);
  const state = crypto.randomUUID();

  const authorize = new URL("https://www.tiktok.com/v2/auth/authorize/");
  authorize.searchParams.set("client_key", clientKey);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", SCOPES);
  authorize.searchParams.set("redirect_uri", redirectUri(url.origin));
  authorize.searchParams.set("state", state);

  const res = NextResponse.redirect(authorize.toString());
  res.cookies.set("tiktok_oauth_state", state, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
