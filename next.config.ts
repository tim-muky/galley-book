import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Supabase storage (our recipe photos)
      {
        protocol: "https",
        hostname: "lgmuazhzipzudtrofxea.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // Any https source (og:image from recipe websites, Google avatars, etc.)
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
