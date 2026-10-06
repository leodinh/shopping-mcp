import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // localhost for normal development; the Cloudflare tunnel hosts for external MCP testing.
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.leodev.online"],
  agentRules: false,
};

export default nextConfig;
