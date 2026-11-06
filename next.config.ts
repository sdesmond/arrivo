import type { NextConfig } from "next";
import packageJson from "./package.json";
import { SECURITY_HEADERS } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  env: { APP_VERSION: packageJson.version },
  distDir: process.env.NEXT_DISTDIR ?? ".next",
  devIndicators: process.env.HIDE_OVERLAY === "true" ? false : { position: "bottom-left" },
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
