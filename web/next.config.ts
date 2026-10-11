import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Dev server is also reached through Tailscale HTTPS (passkeys need one stable hostname).
  allowedDevOrigins: ['omarchy-pc-london.tail6ce266.ts.net'],
  // The liveness vendor's API, as its SDK would call it from the browser. Its verdicts are signed with the vendor's
  // own key, so passing through this server does not let Swissquote change them.
  // Same for the passport guardian (Guardian B): it signs with its own key, after fetching the scan result itself.
  rewrites: async () => [
    { source: '/liveness/:path*', destination: `${process.env.LIVENESS_URL ?? 'http://127.0.0.1:4103'}/:path*` },
    { source: '/passport-guardian/:path*', destination: `${process.env.PASSPORT_URL ?? 'http://127.0.0.1:4104'}/:path*` },
  ],
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
