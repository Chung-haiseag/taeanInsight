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
import { AudioDock } from "@/components/audio/audio-dock";

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
  // 그림은 태안신문 마크다(scripts/gen-icons.mjs 가 public/ 아래 한 벌을 만든다). 선언이 두 벌인 건 쓰는 쪽이 달라서다.
  //   .ico — 탭·즐겨찾기. 바깥 프로그램(RSS 리더·링크 미리보기·모니터링)은 이 <link> 를 읽지 않고
  //     /favicon.ico 를 바로 찍는 것이 많아 **파일이 그 자리에 있는 것 자체가 핵심**이다(public/favicon.ico).
  //     여기 적어 두는 건 읽는 쪽에도 숨기지 않기 위해서다. 16·32·48px 세 장이 한 파일에 들어 있다
  //     (16px 만 날개 한 쪽 — 전체 마크는 가로 2.1:1 이라 그 크기에선 납작하게 눌린다).
  //   .png — 고해상도 화면이 더 큰 그림을 쓸 수 있게.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
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
      <head>
        {/* 제목 글꼴(마루부리) CDN에 미리 연결 — globals.css @font-face 가 여기서 받는다 */}
        <link rel="preconnect" href="https://hangeul.pstatic.net" crossOrigin="anonymous" />
      </head>
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
            {/* 가로폭(레일)은 여기 한 곳에서만 정한다 — 상단 메뉴·바닥글과 같은 1200px.
                화면이 저마다 더 좁히면 메뉴보다 안으로 들어가 어긋나 보인다(2026-10-17 사용자 지적).
                기사 본문 읽는 폭·입력칸 폭은 이 레일 '안에서' 좁히는 것이라 예외. src/lib/page-rail.ts */}
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
            {/* 듣는 중 띠 — 화면이 바뀌어도 소리와 함께 남는다(2026-11-08).
                레이아웃 **마지막 칸**에 sticky 로 둔 이유: fixed 면 바닥글을 덮어 여백을
                따로 밀어 줘야 하는데, sticky 는 맨 아래에서 제 칸에 앉는다.
                틀어 둔 소리가 없으면 아무것도 그리지 않는다. */}
            <AudioDock />
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
