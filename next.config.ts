import type { NextConfig } from "next";
import packageJson from "./package.json";

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
};

export default nextConfig;
