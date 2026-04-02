import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Explicit allowlist — avoids the wildcard "**" that lets attackers
    // trigger image-optimisation fetches for arbitrary external URLs.
    remotePatterns: [
      // Our Supabase Storage bucket (recipe photos)
      {
        protocol: "https",
        hostname: "lgmuazhzipzudtrofxea.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // YouTube thumbnails (fetched during parse)
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
      // Google user-content avatars
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
      // Instagram / Facebook CDN (thumbnails returned by oEmbed)
      {
        protocol: "https",
        hostname: "*.cdninstagram.com",
      },
      {
        protocol: "https",
        hostname: "*.fbcdn.net",
      },
    ],
  },

  // Security headers applied to every response
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
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

export default nextConfig;
