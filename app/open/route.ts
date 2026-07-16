/**
 * Smart "Go to app" target — served at https://app.galleybook.com/open
 *
 * Opens the installed app, or falls back to the right store:
 *  - iOS: this path is a Universal Link (see app/.well-known/apple-app-site-
 *    association). If the app is installed, iOS opens it before this handler
 *    runs — reaching the handler means it is NOT installed → App Store.
 *  - Android: no App Link is registered for this path, so the request hits the
 *    server. We hand off to an intent: URL — opens the app via the galleybook://
 *    scheme if installed, else Chrome follows the Play browser_fallback_url.
 *  - Desktop / other: a phone app can't open here → show both store options.
 *
 * Web-only by design (no native rebuild): the app's InviteHandler no-ops on the
 * unknown /open path, so an incoming Universal Link just foregrounds the app on
 * its home screen. The landing "Go to app" nav link points here.
 */
import { NextRequest, NextResponse, userAgent } from "next/server";

const IOS_URL = "https://apps.apple.com/app/id6764606059";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.galleyworks.galleybook";

// galleybook:// is the app's registered scheme (expo.scheme). The intent URL
// opens it if installed; browser_fallback_url sends Chrome to Play otherwise.
const ANDROID_INTENT =
  "intent://open#Intent;scheme=galleybook;package=com.galleyworks.galleybook;" +
  `S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};end`;

const APPLE_ICON =
  "M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z";
const ANDROID_ICON =
  "M6 9v8a1 1 0 0 0 1 1h1v3a1 1 0 0 0 2 0v-3h4v3a1 1 0 0 0 2 0v-3h1a1 1 0 0 0 1-1V9H6zM4.5 9A1.5 1.5 0 0 0 3 10.5v4a1.5 1.5 0 0 0 3 0v-4A1.5 1.5 0 0 0 4.5 9zm15 0a1.5 1.5 0 0 0-1.5 1.5v4a1.5 1.5 0 0 0 3 0v-4A1.5 1.5 0 0 0 19.5 9zM15.6 3.2l1.1-1.6a.3.3 0 0 0-.5-.34l-1.2 1.7a6.5 6.5 0 0 0-5 0L8.8 1.26a.3.3 0 0 0-.5.34l1.1 1.6A5.7 5.7 0 0 0 6 8h12a5.7 5.7 0 0 0-2.4-4.8zM9.5 6.2a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4zm5 0a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4z";

function icon(path: string): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg>`;
}

function shell(main: string, headExtra = ""): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Get galleybook</title>${headExtra}<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;background:#fff;color:#252729;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:360px;width:100%;text-align:center}
.brand{font-size:14px;letter-spacing:.08em;color:#252729;font-weight:600;margin:0 0 20px}
h1{font-size:22px;font-weight:300;line-height:1.3;margin:0 0 8px}
p.sub{font-size:14px;font-weight:300;color:#474747;margin:0 0 28px}
.btns{display:flex;flex-direction:column;gap:12px}
a.store{display:flex;align-items:center;justify-content:center;gap:10px;padding:14px 24px;border-radius:9999px;border:1px solid #252729;background:#252729;color:#fff;font-size:14px;font-weight:300;text-decoration:none;transition:opacity .15s}
a.store:hover{opacity:.85}
a.hint{display:inline-block;margin-top:20px;font-size:13px;color:#474747}
</style></head><body><main>${main}</main></body></html>`;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function GET(request: NextRequest) {
  const { os } = userAgent(request);

  if (os.name === "iOS") {
    return NextResponse.redirect(IOS_URL, 307);
  }

  if (os.name === "Android") {
    // Hand off to the app (galleybook://) with a Play fallback baked in.
    return shell(
      `<p class="brand">galleybook</p><h1>Opening galleybook…</h1><p class="sub">If nothing happens, get it on Google Play.</p><div class="btns"><a class="store" href="${PLAY_URL}">${icon(ANDROID_ICON)}Google Play</a></div>`,
      `<script>window.location.href=${JSON.stringify(ANDROID_INTENT)}</script>`,
    );
  }

  // Desktop / other — the phone app can't open here; offer both stores.
  return shell(
    `<p class="brand">galleybook</p><h1>Get galleybook on your phone</h1><p class="sub">Download the app to save recipes from anywhere and take them with you.</p><div class="btns"><a class="store" href="${IOS_URL}">${icon(APPLE_ICON)}Download on the App Store</a><a class="store" href="${PLAY_URL}">${icon(ANDROID_ICON)}Get it on Google Play</a></div>`,
  );
}
