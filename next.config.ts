import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**": ["./public/placeholders/**"],
  },
};

export default nextConfig;
