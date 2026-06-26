import type { MetadataRoute } from "next";

// PWA 매니페스트 — 설치형 앱(홈 화면 추가) + iOS Web Push 활성화 조건.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "태안 인사이트",
    short_name: "태안인사이트",
    description: "태안 지역 AI 인텔리전스 — 실시간 현황·뉴스·맞춤 브리핑·취재 알림",
    start_url: "/",
    display: "standalone",
    background_color: "#1a2b4a",
    theme_color: "#1a2b4a",
    lang: "ko",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
