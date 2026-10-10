import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

// App version, baked in at build time:
//   P = production, E = experimental (staging / previews), D = your computer.
// Plus the short commit Vercel built, so every build is identifiable.
const version = (JSON.parse(readFileSync("./package.json", "utf8")) as { version: string }).version;
const channel = process.env.VERCEL_ENV === "production" ? "P" : process.env.VERCEL_ENV ? "E" : "D";
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7);

const nextConfig: NextConfig = {
  // No "X-Powered-By: Next.js" on answers: nothing to tell about what runs the app.
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_APP_CHANNEL: channel,
    NEXT_PUBLIC_APP_COMMIT: commit,
  },
  // Security headers on every page, and the service worker always fresh.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nobody can show the app inside their own page (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
