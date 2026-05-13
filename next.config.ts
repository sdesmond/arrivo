import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: process.env.HIDE_OVERLAY === "true" ? false : { position: "bottom-left" },
};

export default nextConfig;
