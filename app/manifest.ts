import type { MetadataRoute } from "next";

// PWA — cài ra màn hình chính (iOS cần bước này mới nhận được thông báo đẩy)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VN Trader",
    short_name: "VN Trader",
    description: "Trợ lý giao dịch cổ phiếu VN — tín hiệu, vị thế, cảnh báo",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0e14",
    theme_color: "#0b0e14",
    lang: "vi",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
