import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AccessibilityProvider } from "@/components/accessibility-provider";

export const metadata: Metadata = {
  metadataBase: new URL("https://insight.taeannews.co.kr"),
  title: {
    default: "태안 AI 인텔리전스 | 태안신문",
    template: "%s | 태안 AI 인텔리전스",
  },
  description:
    "태안의 관광·환경·부동산 예측 인사이트를 AI로. 매주 발행되는 주간 리포트와 시민 참여형 저널리즘.",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "태안 AI 인텔리전스",
  },
  robots: { index: true, follow: true },
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
    <html lang="ko">
      <body>
        <a href="#main" className="skip-link">
          본문으로 건너뛰기
        </a>
        <AccessibilityProvider>
          <div className="min-h-screen flex flex-col">
            <SiteHeader />
            <main id="main" className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
              {children}
            </main>
            <SiteFooter />
          </div>
        </AccessibilityProvider>
      </body>
    </html>
  );
}
