import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Tab range memakai payload RSC yang sudah di-prefetch. Batasi umurnya
    // 30 detik agar data tidak jauh tertinggal dari AutoRefresh 30 detik.
    staleTimes: { dynamic: 20, static: 30 },
  },
};

export default nextConfig;
