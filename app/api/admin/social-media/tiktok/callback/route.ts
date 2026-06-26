import { requireAdmin } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";

const API = "https://open.tiktokapis.com";

function redirectUri(origin: string): string {
  return process.env.TIKTOK_REDIRECT_URI || `${origin}/api/admin/social-media/tiktok/callback`;
}

export async function GET(request: NextRequest) {
  const user = await requireAdmin();
  const url = new URL(request.url);
  const back = (status: string) =>
    NextResponse.redirect(new URL(`/admin/social-media?tiktok=${status}`, request.url));

  if (url.searchParams.get("error")) {
    logger.warn("admin.tiktok.oauth_denied", { error: url.searchParams.get("error") });
    return back("denied");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.cookies.get("tiktok_oauth_state")?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return back("badstate");
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    logger.error("admin.tiktok.oauth_misconfigured", {});
    return back("misconfigured");
  }

  const tokenRes = await fetch(`${API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(url.origin),
    }),
  });
  const token = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_expires_in?: number;
    open_id?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenRes.ok || !token.access_token || !token.refresh_token) {
    logger.error("admin.tiktok.token_exchange_failed", {
      error: token.error,
      description: token.error_description,
    });
    return back("exchangefailed");
  }

  // Best-effort: the display name to show "Connected as …" (user.info.basic scope).
  let displayName: string | null = null;
  try {
    const infoRes = await fetch(`${API}/v2/user/info/?fields=open_id,display_name`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const info = (await infoRes.json().catch(() => ({}))) as {
      data?: { user?: { display_name?: string } };
    };
    displayName = info.data?.user?.display_name ?? null;
  } catch {
    displayName = null;
  }

  const now = new Date();
  const service = createServiceClient();
  const { error: persistError } = await service.from("tiktok_oauth").upsert({
    id: 1,
    open_id: token.open_id ?? null,
    display_name: displayName,
    scope: token.scope ?? null,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    access_token_expires_at: token.expires_in
      ? new Date(now.getTime() + token.expires_in * 1000).toISOString()
      : null,
    refresh_token_expires_at: token.refresh_expires_in
      ? new Date(now.getTime() + token.refresh_expires_in * 1000).toISOString()
      : null,
    connected_by: user.id,
    connected_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
  if (persistError) {
    logger.error("admin.tiktok.persist_failed", { message: persistError.message });
    return back("storefailed");
  }

  const res = back("connected");
  res.cookies.set("tiktok_oauth_state", "", { path: "/", maxAge: 0 });
  logger.info("admin.tiktok.connected", { openId: token.open_id, displayName });
  return res;
}
