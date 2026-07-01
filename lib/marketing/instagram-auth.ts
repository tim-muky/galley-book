/**
 * Instagram (Instagram Login) user-token management for the comment → DM
 * mechanic (GAL-433). The private-reply send runs on `graph.instagram.com` and
 * needs an *Instagram User* access token — distinct from the Facebook Page
 * token used for carousel publishing (lib/marketing/instagram.ts).
 *
 * The token is obtained via the admin "Connect Instagram" OAuth flow
 * (app/api/admin/social-media/instagram/*) and stored as a singleton row in
 * `instagram_oauth`. Long-lived tokens last ~60 days; getInstagramUserToken()
 * refreshes in place when the stored token is close to expiring.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

const IG_GRAPH = "https://graph.instagram.com";

/** Scopes for the comment → DM mechanic. Must match what's enabled on the app. */
export const INSTAGRAM_SCOPES =
  process.env.INSTAGRAM_SCOPES ||
  "instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages";

export function instagramRedirectUri(origin: string): string {
  return (
    process.env.INSTAGRAM_REDIRECT_URI ||
    `${origin}/api/admin/social-media/instagram/callback`
  );
}

export class InstagramAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstagramAuthError";
  }
}

interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

/** Exchange a short-lived Instagram token for a ~60-day long-lived one. */
export async function exchangeLongLivedToken(shortToken: string): Promise<TokenResponse> {
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!secret) throw new InstagramAuthError("INSTAGRAM_APP_SECRET not set");
  const url = new URL(`${IG_GRAPH}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("access_token", shortToken);
  const res = await fetch(url, { method: "GET" });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: unknown };
  if (!res.ok || !json.access_token) {
    throw new InstagramAuthError(`long-lived exchange failed: ${JSON.stringify(json)}`);
  }
  return json;
}

/** Refresh a long-lived token, extending it another ~60 days. */
async function refreshLongLivedToken(token: string): Promise<TokenResponse> {
  const url = new URL(`${IG_GRAPH}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { method: "GET" });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: unknown };
  if (!res.ok || !json.access_token) {
    throw new InstagramAuthError(`refresh failed: ${JSON.stringify(json)}`);
  }
  return json;
}

export interface InstagramConnection {
  igUserId: string | null;
  token: string;
}

// Refresh once the stored token has under a week of life left.
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The stored Instagram User token, refreshed in place when near expiry. Throws
 * if the account hasn't been connected via the admin OAuth flow.
 */
export async function getInstagramUserToken(): Promise<InstagramConnection> {
  const service = createServiceClient();
  const { data: row } = await service
    .from("instagram_oauth")
    .select("ig_user_id, access_token, token_expires_at")
    .eq("id", 1)
    .maybeSingle();

  if (!row?.access_token) {
    throw new InstagramAuthError(
      "Instagram not connected — connect the account in Admin → Social Media",
    );
  }

  const igUserId = (row.ig_user_id as string | null) ?? null;
  const expMs = row.token_expires_at ? new Date(row.token_expires_at as string).getTime() : 0;
  const nearExpiry = expMs > 0 && expMs - Date.now() < REFRESH_WINDOW_MS;

  if (nearExpiry) {
    try {
      const refreshed = await refreshLongLivedToken(row.access_token as string);
      const now = Date.now();
      await service
        .from("instagram_oauth")
        .update({
          access_token: refreshed.access_token,
          token_expires_at: refreshed.expires_in
            ? new Date(now + refreshed.expires_in * 1000).toISOString()
            : null,
          updated_at: new Date(now).toISOString(),
        })
        .eq("id", 1);
      return { igUserId, token: refreshed.access_token };
    } catch (e) {
      // A refresh failure near expiry shouldn't block a still-valid token.
      logger.warn("instagram.token_refresh_failed", { message: String(e) });
    }
  }

  return { igUserId, token: row.access_token as string };
}
