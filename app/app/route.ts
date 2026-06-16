/**
 * Smart "get the app" redirect — served at https://galleybook.com/app
 *
 * Used as the single Instagram-bio link. iOS visitors go straight to the App
 * Store; everyone else (Android has no public Play listing yet, plus desktop)
 * lands on the website. UTM params are preserved on the web fallback for
 * first-touch attribution, and mapped to Apple's App Analytics campaign token
 * (`ct`) on the App Store URL.
 */
import { NextRequest, NextResponse, userAgent } from "next/server";

const IOS_URL = "https://apps.apple.com/app/id6764606059";

export function GET(request: NextRequest) {
  const incoming = request.nextUrl.searchParams;
  const { os } = userAgent(request);

  if (os.name === "iOS") {
    const url = new URL(IOS_URL);
    const source = incoming.get("utm_source");
    if (source) url.searchParams.set("ct", source);
    return NextResponse.redirect(url, 307);
  }

  const web = new URL("/", request.nextUrl.origin);
  incoming.forEach((value, key) => web.searchParams.set(key, value));
  return NextResponse.redirect(web, 307);
}
