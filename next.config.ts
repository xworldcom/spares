import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**": ["./public/placeholders/**/*"],
  },
  experimental: {
    // Multipart fallback only. Large GLBs go client → Blob and never hit this.
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
