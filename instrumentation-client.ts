// Sentry init for the browser. Reads DSN from env so prod / preview / dev
// can point at different projects if needed; `environment` tag mirrors the
// Vercel deploy env so we can filter issues per stage.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  // Plenty of headroom at prototype scale; tune down if quota fills.
  tracesSampleRate: 1,
  // We opted out during the wizard — Sentry should not collect IP / headers.
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
