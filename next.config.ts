import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DISTDIR ?? ".next",
  devIndicators: process.env.HIDE_OVERLAY === "true" ? false : { position: "bottom-left" },
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
