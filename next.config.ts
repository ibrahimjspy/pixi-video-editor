import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep build tracing scoped to this project when a parent folder also has a
  // lockfile. Without this, Next.js can choose the desktop as its workspace.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
