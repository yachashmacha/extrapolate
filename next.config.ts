import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@solana/web3.js"],
  experimental: {
    // Dynamic pages refetch on every client navigation by default. Thirty seconds
    // matches the desk's own book cache and keeps back/forward instant.
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
  async headers() {
    return [
      {
        source: "/wallets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
      {
        source: "/catalogue",
        headers: [{ key: "Cache-Control", value: "public, max-age=600, stale-while-revalidate=86400" }],
      },
      {
        source: "/desk",
        headers: [{ key: "Cache-Control", value: "public, max-age=600, stale-while-revalidate=86400" }],
      },
      {
        source: "/portfolio",
        headers: [{ key: "Cache-Control", value: "public, max-age=600, stale-while-revalidate=86400" }],
      },
      {
        source: "/docs",
        headers: [{ key: "Cache-Control", value: "public, max-age=600, stale-while-revalidate=86400" }],
      },
      {
        source: "/news",
        headers: [{ key: "Cache-Control", value: "public, s-maxage=60, stale-while-revalidate=300" }],
      },
    ];
  },
};

export default nextConfig;
