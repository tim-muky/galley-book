import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // GAL-188 + GAL-189 — Next.js's tracer doesn't follow `fs.readFileSync`
  // string args, so the Apple root .cer files used by lib/iap/verifier.ts
  // wouldn't otherwise be bundled into the serverless function.
  outputFileTracingIncludes: {
    "/api/iap/**/*": ["./lib/iap/apple-root-certs/*.cer"],
    // GAL-390 — carousel renderer reads Inter ttf via fs.readFile (string arg),
    // which the tracer doesn't follow, so force-include the fonts in the
    // Campaign Studio distribution function.
    // GAL-452 — the reel renderer spawns the static ffmpeg binary and reads
    // background-music files; force-include both (the tracer can't see the
    // spawned binary, and public/* isn't on the function fs by default).
    "/api/admin/campaign-studio/**/*": [
      "./assets/fonts/*.ttf",
      "./node_modules/ffmpeg-static/ffmpeg",
      "./public/audio/*.mp3",
    ],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "auth.galleybook.com",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "*.cdninstagram.com",
      },
      {
        protocol: "https",
        hostname: "*.fbcdn.net",
      },
      {
        protocol: "https",
        hostname: "*.tiktokcdn.com",
      },
      {
        protocol: "https",
        hostname: "*.tiktokcdn-us.com",
      },
    ],
  },

  async headers() {
    // GAL-294. Permissive baseline — we keep 'unsafe-inline' on script-src
    // and style-src because Next.js's runtime emits inline scripts/styles
    // for hydration and Tailwind v4 inlines runtime styles. Tighten with
    // nonces in a follow-up. Allowlist is the union of every host the app
    // actually contacts (Supabase auth+storage on the custom domain and
    // legacy alias, OAuth providers, image CDNs from Recipe parsing,
    // Meta Pixel on the consent-gated landing page).
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self' https://appleid.apple.com https://accounts.google.com",
      "script-src 'self' 'unsafe-inline' https://connect.facebook.net",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "img-src 'self' blob: data: https://auth.galleybook.com https://*.googleusercontent.com https://*.cdninstagram.com https://*.fbcdn.net https://*.tiktokcdn.com https://*.tiktokcdn-us.com https://img.youtube.com https://www.facebook.com",
      // Sentry: client-side SDK POSTs events to the EU ingest endpoint. Without this
      // the browser blocks every Sentry request via CSP and we get no telemetry.
      "connect-src 'self' https://auth.galleybook.com wss://auth.galleybook.com https://www.facebook.com https://connect.facebook.net https://*.ingest.de.sentry.io",
      "frame-src https://appleid.apple.com https://accounts.google.com https://www.facebook.com",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy",    value: csp },
          { key: "X-Content-Type-Options",    value: "nosniff" },
          { key: "X-Frame-Options",            value: "DENY" },
          { key: "X-XSS-Protection",           value: "1; mode=block" },
          { key: "Referrer-Policy",            value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "galleybook",

  project: "galleybook-web",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
