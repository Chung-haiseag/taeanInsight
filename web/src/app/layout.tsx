import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Fraunces } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

// 본문·UI — Pretendard 가변(자체 호스팅). 전 방문자에게 브랜드 타입 확실 전달.
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "45 920",
});
// 디스플레이 — 라틴 숫자·라벨용 올드스타일 세리프(한글은 Pretendard로 폴백). 지오메트릭 산스 × 세리프 페어링.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
});
import { SiteFooter } from "@/components/site-footer";
import { AccessibilityProvider } from "@/components/accessibility-provider";

export const metadata: Metadata = {
  metadataBase: new URL("https://insight.taeannews.co.kr"),
  title: {
    default: "태안 인사이트 | 태안신문",
    template: "%s | 태안 인사이트",
  },
  description:
    "태안의 관광·환경·부동산 예측 인사이트를 AI로. 매주 발행되는 주간 리포트와 시민 참여형 저널리즘.",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "태안 인사이트",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "태안 인사이트 | 태안신문",
    description: "태안의 관광·환경·부동산 예측 인사이트를 AI로.",
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "태안인사이트" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1F2A44",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={`${pretendard.variable} ${fraunces.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          본문으로 건너뛰기
        </a>
        {/* 인쇄·PDF 저장 워터마크(사선 타일). position:fixed 요소는 인쇄 시 페이지마다 반복
            렌더되므로 모든 쪽에 깔린다. 배경 이미지가 아니라 '텍스트'라서 인쇄 옵션의
            '배경 그래픽' 체크 여부와 무관하게 항상 출력된다. 화면에서는 globals.css 가 숨김. */}
        <div className="print-watermark" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i}>태안신문</span>
          ))}
        </div>
        <AccessibilityProvider>
          <div className="min-h-dvh flex flex-col">
            <SiteHeader />
            <main id="main" className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
              {/* 인쇄 페이지 프레임: thead/tfoot은 인쇄 시 페이지마다 반복되므로
                  2페이지 이후에도 상·하단 여백이 유지된다(인쇄 설정 '여백=없음'에서도).
                  화면에서는 globals.css가 display:block + thead/tfoot 숨김 처리해 영향 없음. */}
              <table className="print-frame" role="presentation">
                <thead aria-hidden="true">
                  <tr>
                    <td>
                      <div className="print-frame-space" />
                    </td>
                  </tr>
                </thead>
                <tfoot aria-hidden="true">
                  <tr>
                    <td>
                      <div className="print-frame-space" />
                    </td>
                  </tr>
                </tfoot>
                <tbody>
                  <tr>
                    <td>{children}</td>
                  </tr>
                </tbody>
              </table>
            </main>
            <SiteFooter />
          </div>
        </AccessibilityProvider>
      </body>
    </html>
  );
}
