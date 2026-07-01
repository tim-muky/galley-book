import { requireAdminApi } from "@/lib/auth/admin";
import { META } from "@/lib/marketing/meta-config";
import { getPageAccessToken } from "@/lib/marketing/instagram";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";

// Reads the app's real Graph state with the app + page tokens, so we can see
// what Meta actually registered for the comment → DM webhook instead of
// guessing from the dashboard. Admin session OR `?key=<CRON_SECRET>` (the key
// gate avoids the fragile direct-API cookie session). Findings are also logged
// so they can be read from the Vercel logs. `?subscribe=1` subscribes the Page
// to the app (the step that lets Instagram comment events flow through).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v25.0";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const bypass = Boolean(key && process.env.CRON_SECRET && key === process.env.CRON_SECRET);
  if (!bypass) {
    const guard = await requireAdminApi();
    if ("response" in guard) return guard.response;
  }

  const appSecret = process.env.META_APP_SECRET;
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const callbackUrl = "https://www.galleybook.com/api/webhooks/instagram";
  // `?fix=1` registers both subscriptions; `?subscribe=1` = page link only.
  const doFix = url.searchParams.get("fix") === "1";
  const doSubscribe = doFix || url.searchParams.get("subscribe") === "1";

  const out: Record<string, unknown> = {
    callbackExpected: callbackUrl,
    appId: META.appId,
    pageId: META.pageId,
    igUserId: META.igUserId,
    envAppSecretPresent: Boolean(appSecret),
    envVerifyTokenPresent: Boolean(verifyToken),
  };

  // 1) App-level webhook subscription (Instagram object + `comments` field +
  //    callback). `?fix=1` creates it via POST /{app-id}/subscriptions using the
  //    app access token ("{app-id}|{app-secret}"). Meta re-verifies the callback
  //    with our verify_token during the POST — must match META_WEBHOOK_VERIFY_TOKEN.
  if (appSecret) {
    const appToken = `${META.appId}|${appSecret}`;
    if (doFix && verifyToken) {
      try {
        const res = await fetch(`${GRAPH}/${META.appId}/subscriptions`, {
          method: "POST",
          body: new URLSearchParams({
            object: "instagram",
            callback_url: callbackUrl,
            fields: "comments",
            verify_token: verifyToken,
            access_token: appToken,
          }),
        });
        out.appSubscribeResult = await res.json();
      } catch (e) {
        out.appSubscribeError = String(e);
      }
    }
    try {
      const res = await fetch(
        `${GRAPH}/${META.appId}/subscriptions?access_token=${encodeURIComponent(appToken)}`,
      );
      out.appSubscriptions = await res.json();
    } catch (e) {
      out.appSubscriptionsError = String(e);
    }
  }

  // 2) Page → app subscription (whether this app is subscribed to the Page that
  //    backs the IG account). Optionally create it.
  try {
    const token = await getPageAccessToken();
    if (doSubscribe) {
      const res = await fetch(`${GRAPH}/${META.pageId}/subscribed_apps`, {
        method: "POST",
        body: new URLSearchParams({ subscribed_fields: "feed", access_token: token }),
      });
      out.subscribeResult = await res.json();
    }
    const res = await fetch(
      `${GRAPH}/${META.pageId}/subscribed_apps?access_token=${encodeURIComponent(token)}`,
    );
    out.pageSubscribedApps = await res.json();
  } catch (e) {
    out.pageSubscribedAppsError = String(e);
  }

  logger.info("campaign_studio.ig_webhook_status", out);
  return NextResponse.json(out, { status: 200 });
}
