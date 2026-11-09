/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 개발 서버를 127.0.0.1 로 열어도 화면이 살아 있게 한다.
  //   Next 16 은 dev 자원(/_next/*)에 **다른 출처에서 접근하는 것을 기본으로 막는다.**
  //   `next dev` 는 자기 출처를 localhost 로 보므로, 같은 기계라도 127.0.0.1 로 열면 막힌다 —
  //   서버가 그린 HTML 은 그대로 뜨는데 클라이언트 뭉치가 안 실려 **아무 단추도 안 눌린다.**
  //   오류도 안 난다(서버 로그에 "Blocked cross-origin request ... from 127.0.0.1" 한 줄뿐).
  //   2026-11-08 에 이걸 'next dev 가 이 기계에서 하이드레이트를 안 한다'로 잘못 읽고
  //   확인 경로를 통째로 opennextjs 빌드 + wrangler dev 로 돌렸다. 주소 하나 차이였다.
  //   휴대폰으로 볼 때처럼 랜 주소(192.168.x.x)로 열려면 그 주소도 여기 적는다.
  allowedDevOrigins: ["127.0.0.1"],
  // typedRoutes는 페이지 구조 안정화 후 다시 활성화 (현재 부트스트랩 단계에선 비활성)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
