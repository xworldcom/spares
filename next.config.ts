import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // next dev binds localhost. verify-oee360 and some agents use 127.0.0.1.
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingIncludes: {
    "/api/**": ["./public/placeholders/**/*"],
  },
  experimental: {
    // Multipart fallback only. Large GLBs go client → Blob and never hit this.
    proxyClientMaxBodySize: "100mb",
  },
  async redirects() {
    return [
      {
        source: "/request",
        destination: "/inquire",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
