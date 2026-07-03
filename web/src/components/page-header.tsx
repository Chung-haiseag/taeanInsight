// 공용 페이지 헤더 — eyebrow·제목·설명·강조선을 한 규격으로 통일.
// 17개 페이지가 각자 복붙하던 헤더의 간격·타이포 편차를 하나로 수렴한다.

import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  align = "left",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;       // 우측 상단 버튼 등(왼쪽 정렬일 때만)
  align?: "left" | "center";
}) {
  const centered = align === "center";
  return (
    <header className={`pt-2 ${centered ? "text-center" : ""}`}>
      {eyebrow && (
        <p className={`eyebrow ${centered ? "justify-center" : ""}`}>
          <span className="inline-block h-px w-6 bg-accent" aria-hidden />
          {eyebrow}
        </p>
      )}
      <div className={`mt-4 flex items-end gap-4 ${centered ? "justify-center" : "justify-between"}`}>
        <h1 className="font-display text-display-sm text-brand">{title}</h1>
        {actions && !centered && <div className="shrink-0 pb-1">{actions}</div>}
      </div>
      {description && (
        <p className={`mt-2 text-foreground-muted ${centered ? "mx-auto max-w-prose" : "max-w-prose"}`}>{description}</p>
      )}
      <span className={`accent-rule mt-5 ${centered ? "mx-auto" : ""}`} aria-hidden />
    </header>
  );
}
