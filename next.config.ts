import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @libsql/client ships a native addon — keep it external so the bundler doesn't try to inline it.
  serverExternalPackages: ["@libsql/client"],
};

export default nextConfig;
