import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bấm tab không được dùng bản prefetch cũ — trang cá nhân, dữ liệu phải mới.
  experimental: {
    staleTimes: { dynamic: 0 },
  },
  // Prisma binary engine chỉ cần libquery_engine-*.so.node; WASM base64 (~57MB/deployment)
  // dành cho engineType=wasm/driverAdapters — app không dùng, bỏ khỏi function bundle.
  outputFileTracingExcludes: {
    "*": [
      "**/node_modules/@prisma/client/runtime/query_engine_bg.*.wasm-base64.*",
      "**/node_modules/@prisma/client/runtime/query_compiler_bg.*.wasm-base64.*",
      "**/node_modules/@prisma/client/runtime/wasm-engine-edge.*",
      "**/node_modules/@prisma/client/runtime/wasm-compiler-edge.*",
      "**/node_modules/.prisma/client/query_engine_bg.wasm",
      "**/node_modules/.prisma/client/wasm*.mjs",
      "**/node_modules/.prisma/client/wasm.js",
    ],
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
