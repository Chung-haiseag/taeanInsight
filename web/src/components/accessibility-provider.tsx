"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type FontSize = "base" | "large" | "xlarge";
type Theme = "default" | "highcontrast";

type A11yContextValue = {
  fontSize: FontSize;
  setFontSize: (s: FontSize) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
};

const A11yContext = createContext<A11yContextValue | null>(null);

const STORAGE_KEY = "taean-insight-a11y";

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>("base");
  const [theme, setThemeState] = useState<Theme>("default");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { fontSize?: FontSize; theme?: Theme };
        if (parsed.fontSize) setFontSizeState(parsed.fontSize);
        if (parsed.theme) setThemeState(parsed.theme);
      }
    } catch {
      // localStorage 접근 실패 무시 (SSR·프라이빗 모드)
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.fontSize = fontSize;
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontSize, theme }));
    } catch {
      // 저장 실패 무시
    }
  }, [fontSize, theme]);

  return (
    <A11yContext.Provider
      value={{ fontSize, setFontSize: setFontSizeState, theme, setTheme: setThemeState }}
    >
      {children}
    </A11yContext.Provider>
  );
}

export function useAccessibility() {
  const ctx = useContext(A11yContext);
  if (!ctx) throw new Error("useAccessibility must be used within AccessibilityProvider");
  return ctx;
}
