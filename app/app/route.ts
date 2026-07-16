/**
 * Smart "get the app" redirect — served at https://galleybook.com/app
 *
 * Used as the single Instagram-bio link. iOS visitors go to the App Store,
 * Android visitors to the Google Play listing, and everyone else (desktop) to
 * the website. UTM params are preserved for first-touch attribution:
 *   - iOS: utm_source → Apple's App Analytics campaign token (`ct`)
 *   - Android: utm_* → Google Play Install Referrer (`referrer`), parsed by
 *     lib/playReferrer.ts on install so Android lands in the same model as web
 *   - web fallback: all params forwarded on the URL
 */
import { NextRequest, NextResponse, userAgent } from "next/server";

const IOS_URL = "https://apps.apple.com/app/id6764606059";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.galleyworks.galleybook";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

export function GET(request: NextRequest) {
  const incoming = request.nextUrl.searchParams;
  const { os } = userAgent(request);

  if (os.name === "iOS") {
    const url = new URL(IOS_URL);
    const source = incoming.get("utm_source");
    if (source) url.searchParams.set("ct", source);
    return NextResponse.redirect(url, 307);
  }

  if (os.name === "Android") {
    const url = new URL(PLAY_URL);
    const referrer = new URLSearchParams();
    for (const key of UTM_KEYS) {
      const value = incoming.get(key);
      if (value) referrer.set(key, value);
    }
    const ref = referrer.toString();
    if (ref) url.searchParams.set("referrer", ref);
    return NextResponse.redirect(url, 307);
  }

  const web = new URL("/", request.nextUrl.origin);
  incoming.forEach((value, key) => web.searchParams.set(key, value));
  return NextResponse.redirect(web, 307);
}
