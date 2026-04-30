/**
 * Apple App Site Association — served at
 *   https://app.galleybook.com/.well-known/apple-app-site-association
 *
 * Hosted as a route handler so the Content-Type is application/json — Apple's
 * AASA fetcher rejects responses without it.
 *
 * The team prefix comes from APPLE_APP_ID_PREFIX (a 10-char Apple Team ID).
 * We append the bundle id at runtime to keep the env var single-purpose. If
 * the env var isn't set we still emit a valid-shape document so the route
 * doesn't 500 — but Universal Links won't work until the team id is wired up.
 */
import { NextResponse } from "next/server";

const BUNDLE_ID = "com.galleyworks.galleybook";

export async function GET() {
  const teamId = process.env.APPLE_APP_ID_PREFIX?.trim() ?? "";
  const appID = teamId ? `${teamId}.${BUNDLE_ID}` : BUNDLE_ID;

  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appID,
          appIDs: teamId ? [appID] : undefined,
          // /share/* intentionally absent: clicking a share URL on a phone
          // with the app installed should fall through to the web share
          // page, where the recipe renders without needing a native
          // RecipeDetail navigation flow that handles non-member galleys.
          // Re-add once GAL-221 ships native /share/:token handling.
          paths: ["/join/*"],
        },
      ],
    },
  };

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
