import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 第 4 步成片回传上限 80MB；有 proxy.ts 时默认缓冲只有 10MB
    proxyClientMaxBodySize: "80mb",
  },
};

export default nextConfig;
