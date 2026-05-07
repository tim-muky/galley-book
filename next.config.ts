import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // GAL-188 + GAL-189 — Next.js's tracer doesn't follow `fs.readFileSync`
  // string args, so the Apple root .cer files used by lib/iap/verifier.ts
  // wouldn't otherwise be bundled into the serverless function.
  outputFileTracingIncludes: {
    "/api/iap/**/*": ["./lib/iap/apple-root-certs/*.cer"],
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
      "connect-src 'self' https://auth.galleybook.com wss://auth.galleybook.com https://www.facebook.com https://connect.facebook.net",
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

export default withNextIntl(nextConfig);
