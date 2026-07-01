import { requireAdmin } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { exchangeLongLivedToken, instagramRedirectUri } from "@/lib/marketing/instagram-auth";
import { NextRequest, NextResponse } from "next/server";

const IG_GRAPH = "https://graph.instagram.com";

export async function GET(request: NextRequest) {
  const user = await requireAdmin();
  const url = new URL(request.url);
  const back = (status: string) =>
    NextResponse.redirect(new URL(`/admin/social-media?instagram=${status}`, request.url));

  if (url.searchParams.get("error")) {
    logger.warn("admin.instagram.oauth_denied", { error: url.searchParams.get("error") });
    return back("denied");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.cookies.get("instagram_oauth_state")?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return back("badstate");
  }

  const clientId = process.env.INSTAGRAM_APP_ID;
  const clientSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!clientId || !clientSecret) {
    logger.error("admin.instagram.oauth_misconfigured", {});
    return back("misconfigured");
  }

  // 1) Short-lived token exchange (form POST to api.instagram.com). Instagram
  //    appends "#_" to the code on redirect — strip it.
  const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      redirect_uri: instagramRedirectUri(url.origin),
      code: code.replace(/#_$/, ""),
    }),
  });
  const short = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    user_id?: string | number;
    permissions?: string[] | string;
    data?: { access_token?: string; user_id?: string | number; permissions?: string[] | string }[];
    error_message?: string;
  };
  const shortToken = short.access_token ?? short.data?.[0]?.access_token;
  const rawUserId = short.user_id ?? short.data?.[0]?.user_id;
  const permissions = short.permissions ?? short.data?.[0]?.permissions;
  if (!tokenRes.ok || !shortToken) {
    logger.error("admin.instagram.token_exchange_failed", { message: short.error_message });
    return back("exchangefailed");
  }

  // 2) Long-lived exchange (~60 days).
  let longToken: string;
  let expiresIn: number | undefined;
  try {
    const ll = await exchangeLongLivedToken(shortToken);
    longToken = ll.access_token;
    expiresIn = ll.expires_in;
  } catch (e) {
    logger.error("admin.instagram.longlived_failed", { message: String(e) });
    return back("exchangefailed");
  }

  // 3) Resolve the account username (+ id) for "Connected as …".
  let username: string | null = null;
  let igUserId = rawUserId != null ? String(rawUserId) : null;
  try {
    const meRes = await fetch(
      `${IG_GRAPH}/me?fields=user_id,username&access_token=${encodeURIComponent(longToken)}`,
    );
    const me = (await meRes.json().catch(() => ({}))) as { user_id?: string | number; username?: string };
    username = me.username ?? null;
    if (me.user_id != null) igUserId = String(me.user_id);
  } catch {
    username = null;
  }

  const now = new Date();
  const service = createServiceClient();
  const { error: persistError } = await service.from("instagram_oauth").upsert({
    id: 1,
    ig_user_id: igUserId,
    username,
    scope: Array.isArray(permissions) ? permissions.join(",") : permissions ?? null,
    access_token: longToken,
    token_expires_at: expiresIn
      ? new Date(now.getTime() + expiresIn * 1000).toISOString()
      : null,
    connected_by: user.id,
    connected_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
  if (persistError) {
    logger.error("admin.instagram.persist_failed", { message: persistError.message });
    return back("storefailed");
  }

  const res = back("connected");
  res.cookies.set("instagram_oauth_state", "", { path: "/", maxAge: 0 });
  logger.info("admin.instagram.connected", { igUserId, username });
  return res;
}
