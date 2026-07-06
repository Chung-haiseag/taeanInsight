// 동적 OG 이미지 — 제목이 그려진 브랜드 카드(대표사진 없는 기사·리포트용). 한국어 폰트 런타임 로드.
//   /api/og?title=...&tag=...
import { ImageResponse } from "next/og";

// 한국어 폰트(Black Han Sans, 단일 굵기) — 모듈 스코프 캐시(웜 인스턴스 재사용)
let fontData: ArrayBuffer | null = null;
async function korFont(): Promise<ArrayBuffer | null> {
  if (fontData) return fontData;
  try {
    const res = await fetch("https://raw.githubusercontent.com/google/fonts/main/ofl/dohyeon/DoHyeon-Regular.ttf");
    if (!res.ok) return null;
    fontData = await res.arrayBuffer();
    return fontData;
  } catch { return null; }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("title") || "태안 인사이트").slice(0, 70);
  const tag = (searchParams.get("tag") || "태안신문 · AI 인텔리전스").slice(0, 40);
  const font = await korFont();
  try {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#1a2b4a", color: "#f5f5f0", padding: "72px", justifyContent: "space-between", borderLeft: "24px solid #4FB3BD", fontFamily: font ? "KOR" : "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 30, color: "#4FB3BD", letterSpacing: 2, fontWeight: 700 }}>{tag}</div>
        <div style={{ display: "flex", fontSize: 66, lineHeight: 1.25 }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, color: "#4FB3BD" }}>
          <div style={{ width: 48, height: 8, background: "#4FB3BD" }} /> insight.taeannews.co.kr
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: font ? [{ name: "KOR", data: font, weight: 400, style: "normal" }] : undefined },
  );
  } catch (e) {
    return new Response(`OG error: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}
