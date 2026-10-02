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
  // 2026-10 리디자인: 신문 1면과 같은 세리프 제목·ti 토큰. 아래 선은 두지 않는다 — 바로 이어지는 섹션 머리(SecHead)의 굵은 먹선과 겹친다.
  return (
    <header className={`pb-2 pt-2 ${centered ? "text-center" : ""}`}>
      {eyebrow && (
        <p className={`text-[0.85rem] font-bold tracking-[0.14em] text-ti-petrol-ink ${centered ? "text-center" : ""}`}>{eyebrow}</p>
      )}
      <div className={`mt-1.5 flex flex-wrap items-end gap-4 ${centered ? "justify-center" : "justify-between"}`}>
        <h1 className="font-head text-[clamp(2rem,4.4vw,3rem)] font-black leading-tight tracking-[-0.025em] text-ti-ink">{title}</h1>
        {actions && !centered && <div className="shrink-0 pb-1">{actions}</div>}
      </div>
      {description && (
        <p className={`mt-2 text-[1.08rem] text-ti-ink2 ${centered ? "mx-auto max-w-[40em]" : "max-w-[40em]"}`}>{description}</p>
      )}
    </header>
  );
}
