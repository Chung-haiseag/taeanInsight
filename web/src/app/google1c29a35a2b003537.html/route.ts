// 구글 서치 콘솔 소유권 확인(HTML 파일 방식) — public/의 .html이 OpenNext에서 루트 서빙되지 않아
//   라우트 핸들러로 워커가 직접 검증 내용을 반환한다. 확인 유지를 위해 삭제 금지.
export const dynamic = "force-static";

export function GET(): Response {
  return new Response("google-site-verification: google1c29a35a2b003537.html", {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=86400" },
  });
}
