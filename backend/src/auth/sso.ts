// taeannews.co.kr SSO — OAuth2 Authorization Code Flow
// PRD v1.8 §6 REQ-PLATFORM-003

import { signJwt } from "./jwt";

export interface SsoConfig {
  taeanAuthorizeUrl: string;       // https://taeannews.co.kr/oauth/authorize
  taeanTokenUrl: string;            // https://taeannews.co.kr/oauth/token
  taeanUserInfoUrl: string;         // https://taeannews.co.kr/oauth/userinfo
  clientId: string;
  clientSecret: string;
  redirectUri: string;              // https://api.insight.taeannews.co.kr/api/auth/sso/callback
  jwtSecret: string;
}

export interface TaeanUserInfo {
  id: string;                       // taeannews 외래 식별자
  email: string;
  display_name?: string;
  role_hint?: string;               // 기본 권한 힌트 (선택)
}

export class SsoClient {
  constructor(private cfg: SsoConfig) {}

  /** 로그인 시작 — taeannews 인증 페이지로 리다이렉트할 URL 생성 */
  buildAuthorizeUrl(state: string, scope = "openid email profile"): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.cfg.clientId,
      redirect_uri: this.cfg.redirectUri,
      scope,
      state,
    });
    return `${this.cfg.taeanAuthorizeUrl}?${params.toString()}`;
  }

  /** 콜백에서 받은 authorization code를 access token으로 교환 */
  async exchangeCode(code: string): Promise<{ accessToken: string; refreshToken?: string }> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.cfg.redirectUri,
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
    });
    const res = await fetch(this.cfg.taeanTokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`SSO token exchange failed: ${res.status}`);
    const data = await res.json() as { access_token: string; refresh_token?: string };
    return { accessToken: data.access_token, refreshToken: data.refresh_token };
  }

  /** 사용자 프로필 조회 */
  async fetchUserInfo(taeanAccessToken: string): Promise<TaeanUserInfo> {
    const res = await fetch(this.cfg.taeanUserInfoUrl, {
      headers: { Authorization: `Bearer ${taeanAccessToken}` },
    });
    if (!res.ok) throw new Error(`SSO userinfo failed: ${res.status}`);
    return res.json();
  }

  /** taeannews 사용자 정보 → 내부 JWT 발급 */
  async issueInsightJwt(user: { id: string; role: string; email?: string }): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const [accessToken, refreshToken] = await Promise.all([
      signJwt({ sub: user.id, role: user.role, email: user.email }, "access", this.cfg.jwtSecret),
      signJwt({ sub: user.id, role: user.role, email: user.email }, "refresh", this.cfg.jwtSecret),
    ]);
    return { accessToken, refreshToken };
  }
}
