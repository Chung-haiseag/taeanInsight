import type { Config } from "tailwindcss";

// PRD v1.4 §8 디자인 시스템: 네이비/오프화이트, 황토색 AI 라벨, 한국어 가독성
export default {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1F2A44", // navy primary
          dark: "#0E1730",
          light: "#3A4B73",
        },
        accent: {
          DEFAULT: "#B8860B", // 황토색 (AI 보조 라벨)
          subtle: "#E8D7A4",
        },
        background: {
          DEFAULT: "#FAF9F6", // 오프화이트
          highcontrast: "#FFFFFF",
        },
        foreground: {
          DEFAULT: "#1F2A44",
          highcontrast: "#000000",
          muted: "#5B6478",
        },
      },
      fontFamily: {
        sans: [
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Roboto",
          "sans-serif",
        ],
      },
      fontSize: {
        // 사용자 글자 크기 옵션 3단계 — Tailwind plugin 없이 CSS 변수로 동적 스케일링
        base: ["var(--font-size-base, 1rem)", { lineHeight: "1.6" }],
      },
      screens: {
        // PRD §7.6 브레이크포인트
        sm: "320px",
        md: "768px",
        lg: "1024px",
        xl: "1440px",
      },
    },
  },
  plugins: [],
} satisfies Config;
