import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DISTDIR ?? ".next",
  devIndicators: process.env.HIDE_OVERLAY === "true" ? false : { position: "bottom-left" },
};

export default nextConfig;
