# 도메인 관리자 요청 이메일 템플릿

다음 내용을 복사해 `taeannews.co.kr` 도메인 관리자에게 메일·메신저로 전달하세요.

**전제**: 배포는 Cloudflare Pages로 진행 (PRD v1.6 확정).

---

## 메일 본문 (Cloudflare Pages 배포)

```
제목: [태안신문] insight.taeannews.co.kr 서브도메인 DNS 추가 요청

안녕하세요,

태안신문이 추진하는 2026년 지역신문발전위원회 지원 사업
"태안 AI 인텔리전스 커먼즈 플랫폼"의 신규 서브도메인 설정을 요청드립니다.

▣ 요청 사항
- 도메인: taeannews.co.kr
- 추가할 서브도메인: insight.taeannews.co.kr
- 배포 플랫폼: Cloudflare Pages (무제한 무료 트래픽)
- 기존 사이트(taeannews.co.kr) 영향: 없음 (별도 서브도메인)

▣ DNS 레코드 추가
    Type:   CNAME
    Name:   insight
    Value:  taean-insight.chs9182.workers.dev.
    TTL:    3600 (또는 자동)

  * Value 값(`taean-insight.pages.dev`)은 Cloudflare Pages 프로젝트
    생성 후 정확한 값을 다시 확인해 알려드리겠습니다.

▣ HTTPS·SSL
  Cloudflare가 SSL을 자동 발급·갱신합니다 (Universal SSL).
  도메인 등록기관 측 추가 작업 불필요.

▣ 완료 후 검증
    dig insight.taeannews.co.kr +short
    curl -I https://insight.taeannews.co.kr

▣ 전파 시간
  보통 10분~1시간, 최대 24시간.

▣ 문의
  설정 완료 후 디지털전환 총괄에게 회신 주시면
  Cloudflare 측 Custom domain 등록을 마무리하겠습니다.

▣ 참고 문서
  본 저장소의 docs/infrastructure/dns-setup-guide.md 에
  단계별 가이드와 트러블슈팅이 정리되어 있습니다.

감사합니다.
[발신자명]
```

---

## 메일 본문 (자체 서버 / NCloud 대안 — 한국 데이터 보관 필요 시)

```
제목: [태안신문] insight.taeannews.co.kr 서브도메인 DNS 추가 요청

안녕하세요,

태안신문 AI 인텔리전스 플랫폼 서브도메인 추가 요청드립니다.

▣ 요청 사항
- 도메인: taeannews.co.kr
- 추가할 서브도메인: insight.taeannews.co.kr
- 호스팅: NCloud (또는 자체 서버 — 한국 데이터 보관)
- 기존 사이트 영향: 없음

▣ DNS 레코드 추가
    Type:   A
    Name:   insight
    Value:  <서버 공인 IP>     ← 별도 통보 예정
    TTL:    3600

▣ HTTPS·SSL
  서버 측에서 Let's Encrypt + certbot으로 발급 예정.
  도메인 등록기관 작업 불필요.

▣ 완료 후 확인 명령
    dig insight.taeannews.co.kr +short

감사합니다.
[발신자명]
```

---

## 카톡·메신저 단문 (요약본)

```
[태안신문 AI 사업] 서브도메인 추가 요청드립니다.

도메인 등록기관 DNS 관리에서 아래 1줄만 추가해주세요:

  Type: CNAME
  Name: insight
  Value: taean-insight.chs9182.workers.dev.

기존 taeannews.co.kr 사이트에는 영향 없습니다.
완료되면 알려주세요. 감사합니다!
```

---

## 완료 통보 회신 양식 (관리자 → 개발팀)

```
DNS 설정 완료했습니다.

- 도메인: insight.taeannews.co.kr
- 적용 시각: YYYY-MM-DD HH:MM
- 레코드: CNAME → taean-insight.chs9182.workers.dev.

dig 확인 결과:
[dig insight.taeannews.co.kr +short 결과 붙여넣기]
```
