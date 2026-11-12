import type { NextConfig } from "next";
import packageJson from "./package.json";
import { SECURITY_HEADERS } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  env: { APP_VERSION: packageJson.version },
  distDir: process.env.NEXT_DISTDIR ?? ".next",
  devIndicators: process.env.HIDE_OVERLAY === "true" ? false : { position: "bottom-left" },
  experimental: {
    // Next buffers proxied request bodies only up to this limit (default 10 MB) and truncates the rest silently.
    // 26 MB admits the 25 MB document limit plus multipart overhead; src/lib/api/route.test.ts guards the floor.
    proxyClientMaxBodySize: "26mb",
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
