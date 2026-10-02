import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

// 본문·UI — Pretendard 가변(자체 호스팅). 전 방문자에게 브랜드 타입 확실 전달.
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "45 920",
});
import { SiteFooter } from "@/components/site-footer";
import { AccessibilityProvider } from "@/components/accessibility-provider";

export const metadata: Metadata = {
  metadataBase: new URL("https://axtaeannews.co.kr"),
  // 사이트 전 페이지 canonical = apex https 고정. www.axtaeannews.co.kr 도 같은 Worker에 붙어 있어
  // 리다이렉트 없이 동일 내용을 200으로 내므로(http:80도 마찬가지), canonical이 없으면 중복 주소로
  // 색인 신호가 갈린다. 기사 페이지는 이미 alternates.canonical을 직접 지정하고 있고, './'는
  // 현재 경로를 metadataBase에 대해 해석해 나머지 전 페이지를 덮는다.
  alternates: { canonical: "./" },
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
    <html lang="ko" className={pretendard.variable}>
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
            <main id="main" className="flex-1 container mx-auto px-4 py-8 max-w-[1200px]">
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
          {/* AI 코파일럿(화면 옆 대화창)은 **꺼 둔다**(2026-08-27, 사용자 판단).
              되살리려면 이 자리에 <Copilot /> 한 줄을 다시 넣으면 된다 —
              컴포넌트(components/copilot/)와 서버 쪽(문맥·대화 이어짐·근거 판정)은 그대로 살아 있다.
              AI 질의응답 자체는 /query 전체 화면으로 남아 있고, 홈 히어로의 '무엇이든 질문하기'가 그리로 간다. */}
        </AccessibilityProvider>
      </body>
    </html>
  );
}
