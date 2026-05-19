/**
 * Android Digital Asset Links — served at
 *   https://app.galleybook.com/.well-known/assetlinks.json
 *
 * Required for Android App Links auto-verification (the `autoVerify: true`
 * intent filter in galley-book-native's app.json). Without it,
 * https://app.galleybook.com/join/<token> opens in Chrome instead of
 * routing into galleybook.
 *
 * The Play-managed app-signing key fingerprint comes from
 * Play Console → Setup → App integrity → App signing. It's a hash of the
 * public certificate, not a secret — published by Play to anyone with
 * the package name.
 *
 * Multiple fingerprints are supported. Add the EAS upload-key SHA-256 here
 * too if we ever need sideloaded dev APKs to handle https://app.galleybook.com
 * App Links (currently they go through the `galleybook://` deep-link path
 * instead, so the upload fingerprint isn't required).
 */
import { NextResponse } from "next/server";

const PACKAGE_NAME = "com.galleyworks.galleybook";

const SHA256_FINGERPRINTS: string[] = [
  // Play app-signing key (production, all Play-distributed builds).
  "F2:4E:73:D0:BE:92:75:AF:71:85:C1:28:07:C1:57:B5:8C:31:0D:D7:B7:3E:AB:E5:7B:AC:E3:47:CE:B4:8E:98",
];

export async function GET() {
  const body = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: PACKAGE_NAME,
        sha256_cert_fingerprints: SHA256_FINGERPRINTS,
      },
    },
  ];

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
