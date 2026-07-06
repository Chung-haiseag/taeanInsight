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
          DEFAULT: "#B8860B", // 황토색 (채움·보더·AI 라벨 배경용)
          subtle: "#E8D7A4",
          ink: "#7A5C0A",     // 크림 위 텍스트용(대비 ~6:1, WCAG AA) — eyebrow/강조 텍스트
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
        // 에디토리얼 디스플레이 — 큰 숫자·라틴 헤드라인용 세리프
        display: ['"Iowan Old Style"', '"Apple Garamond"', "Georgia", '"Times New Roman"', "serif"],
      },
      fontSize: {
        // 사용자 글자 크기 옵션 3단계 — Tailwind plugin 없이 CSS 변수로 동적 스케일링
        base: ["var(--font-size-base, 1rem)", { lineHeight: "1.6" }],
        // 에디토리얼 타이포 스케일
        display: ["clamp(2.5rem, 6vw, 4.5rem)", { lineHeight: "1.05", letterSpacing: "-0.03em", fontWeight: "800" }],
        "display-sm": ["clamp(1.75rem, 4vw, 2.75rem)", { lineHeight: "1.12", letterSpacing: "-0.02em", fontWeight: "700" }],
      },
      letterSpacing: {
        kicker: "0.18em",
      },
      boxShadow: {
        card: "0 1px 3px rgba(31,42,68,0.06)",
        soft: "0 1px 2px rgba(31,42,68,0.04), 0 2px 10px rgba(31,42,68,0.05)",
        lift: "0 8px 30px rgba(31,42,68,0.10)",
      },
      maxWidth: {
        prose: "42rem",
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
