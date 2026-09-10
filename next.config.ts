import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 纯前端静态导出：next build 生成 out/ 目录，供 Cloudflare Pages / GitHub Pages 静态托管
  output: "export",
};

export default nextConfig;
