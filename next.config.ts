import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bấm tab không được dùng bản prefetch cũ — trang cá nhân, dữ liệu phải mới.
  experimental: {
    staleTimes: { dynamic: 0 },
  },
  async redirects() {
    // Đường cũ nằm trong /signals — bấm tab bị Next vẽ cả hai trang và sáng nhầm tab.
    return [{ source: "/signals/evidence", destination: "/gia-sau", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      {
        // HTML/API, không đụng file tĩnh đã hash. Trang cũ trong cache + điều hướng mới = tab trùng.
        source: "/((?!_next/static|_next/image|.*\\..*).*)",
        headers: [{ key: "Cache-Control", value: "private, no-cache, no-store, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
