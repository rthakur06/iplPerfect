import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @libsql/client ships a native addon — keep it external so the bundler doesn't try to inline it.
  serverExternalPackages: ["@libsql/client"],

  // Baseline security headers on every response (defense in depth).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" }, // no embedding in iframes (clickjacking)
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },
};

export default nextConfig;
