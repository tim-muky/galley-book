import { requireAdminApi } from "@/lib/auth/admin";
import { META } from "@/lib/marketing/meta-config";
import { getPageAccessToken } from "@/lib/marketing/instagram";
import { NextResponse } from "next/server";

// Reads the app's real Graph state with the app + page tokens, so we can see
// what Meta actually registered for the comment → DM webhook instead of
// guessing from the dashboard. Admin-only; open it in the browser while logged
// in. `?subscribe=1` also subscribes the Page to the app (the step that lets
// Instagram comment events flow through).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v25.0";

export async function GET(request: Request) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;

  const appSecret = process.env.META_APP_SECRET;
  const doSubscribe = new URL(request.url).searchParams.get("subscribe") === "1";

  const out: Record<string, unknown> = {
    callbackExpected: "https://www.galleybook.com/api/webhooks/instagram",
    appId: META.appId,
    pageId: META.pageId,
    igUserId: META.igUserId,
    envAppSecretPresent: Boolean(appSecret),
    envVerifyTokenPresent: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN),
  };

  // 1) App-level webhook subscription (Instagram object + fields + callback).
  //    Needs an app access token, which is literally "{app-id}|{app-secret}".
  if (appSecret) {
    try {
      const res = await fetch(
        `${GRAPH}/${META.appId}/subscriptions?access_token=${encodeURIComponent(`${META.appId}|${appSecret}`)}`,
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

  return NextResponse.json(out, { status: 200 });
}
