import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Dev server is also reached through Tailscale HTTPS (passkeys need one stable hostname).
  allowedDevOrigins: ['omarchy-pc-london.tail6ce266.ts.net'],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
