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
          DEFAULT: "#116E7A", // 갯벌 페트롤(딥틸) — 채움·보더·AI 라벨 배경용
          subtle: "#CFE3E6",
          ink: "#0E5860",     // 크림 위 텍스트용(대비 AA) — eyebrow/강조 텍스트
        },
        background: {
          DEFAULT: "#F5F7F7", // 쿨 페이퍼(페트롤 액센트와 조화, 크림=AI클러스터 탈피)
          highcontrast: "#FFFFFF",
        },
        // 2026-10 홈 리디자인(신문 1면) 토큰 — 값은 globals.css 의 --ti-* 변수(고대비에서 바뀜).
        ti: {
          paper: "var(--ti-paper)",
          surface: "var(--ti-surface)",
          sunk: "var(--ti-sunk)",
          ink: "var(--ti-ink)",
          ink2: "var(--ti-ink-2)",
          muted: "var(--ti-muted)",
          line: "var(--ti-line)",
          navy: "var(--ti-navy)",
          "navy-deep": "var(--ti-navy-deep)",
          "on-navy": "var(--ti-on-navy)",
          "on-navy-muted": "var(--ti-on-navy-muted)",
          petrol: "var(--ti-petrol)",
          "petrol-ink": "var(--ti-petrol-ink)",
          "petrol-soft": "var(--ti-petrol-soft)",
          gold: "var(--ti-gold)",
          "gold-ink": "var(--ti-gold-ink)",
          "gold-soft": "var(--ti-gold-soft)",
          "on-gold": "var(--ti-on-gold)",
        },
        foreground: {
          DEFAULT: "#1F2A44",
          highcontrast: "#000000",
          muted: "#5B6478",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Roboto",
          "sans-serif",
        ],
        // 제목 — 마루부리(네이버, OFL). 단정한 현대 명조라 신문 느낌은 남기고 촌스러움은 덜다(2026-10 사용자 선택).
        //   본문·숫자는 Pretendard. 글꼴은 globals.css @font-face 가 네이버 한글 CDN에서 받는다(swap).
        head: ['"MaruBuri"', "var(--font-sans)", "Pretendard", "serif"],
        // 숫자·디스플레이 — 예전 Fraunces 자리. 같은 Pretendard에 tabular-nums(사용처에서)로 자릿수를 맞춘다.
        display: ["var(--font-sans)", "Pretendard", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
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
