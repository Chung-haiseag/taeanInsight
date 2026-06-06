# 태안신문 아카이브 백필 — 검증용 프로토타입

`articleView.html?idxno=N` 을 순차 수집해 메타데이터+본문을 파싱하고 플랫폼 도메인으로 분류하는
재개 가능·rate-limit 적용 Node 스크립트. PRD #10(20년 아카이브 스크래퍼) 타당성 검증용.

## 사용법

```bash
cd tools/backfill
node backfill.mjs --sample                  # 2002~2026 스프레드 표본으로 파싱 검증 (비로그인)
node backfill.mjs --start 5000 --end 5100   # 연속 구간
node backfill.mjs --start 1 --end 68300 --delay 400 --concurrency 2   # 전체(승인 후)
```

### 회원 로그인(본문 해제) — 자격 증명은 환경변수로만

회원전용 기사 본문은 로그인 세션이 있어야 내려옵니다. 비밀번호는 **코드/로그/커밋에 절대 넣지 말고** 환경변수로 전달하세요.

```bash
export TAEAN_ID='아이디'
export TAEAN_PW='비밀번호'

# 1) 먼저 1건 테스트 — 회원 세션으로 본문이 풀리는지 확인 (CAPTCHA/계정등급 점검)
node backfill.mjs --test 5000

# 2) 풀리면 본문 포함 백필
node backfill.mjs --login --start 1 --end 68300 --delay 500
```

- `--test N`: 로그인 → 기사 N 1건만 가져와 **본문 잠김 해제 여부**를 보고
- `--login`: 백필 전체를 로그인 세션으로 실행
- 로그인은 `POST /member/login.php` (user_id/user_pw). 반복 실패 시 CAPTCHA(`loginCaptcha`)가 뜰 수 있으니 자격 증명을 정확히.

- 출력: `out/articles.jsonl` (기사 1건/줄), `out/summary.json` (집계)
- 재개: 기존 `out/articles.jsonl` 의 idxno 는 건너뜀
- 진행 표시: `#`=수집, `@`=회원전용(본문 없음), `.`=결번, `x`=오류
- Node 20+ (global fetch), 외부 의존성 없음

## 검증 결과 (2026-06-06, --sample 19건)

### ✅ 가능한 것
- **idxno 순차 열거로 전체 인덱싱 가능**: 결번은 `존재하지 않는 링크`(HTTP 200) 또는 HTTP 404 로 감지·스킵
- **메타데이터는 모든 기사에서 추출 가능** (회원전용이라도):
  - 제목 `og:title`, 발행일 `article:published_time`(ISO), 섹션 `article:section`/`section1`
  - 예: `뉴스>사회`, `라이프>스포츠`, `선거특집>2026.6.3 지방선거`
- 온라인 아카이브 시작: **2002-02-05** (idxno≈50). 그 이전 idxno(2~30)는 결번
- 전체 기사 수: **약 60,608건** (articleList 기준), 최대 idxno≈68,300

### ❌ 막히는 것 (핵심)
- **본문 전문은 대부분 "회원전용기사"** — 비로그인 시 HTML 에 본문 대신 로그인 안내만 옴
  - 표본 16건 중 **15건(94%)이 회원전용**, 본문 0자. 2026년 최신 기사도 다수 회원전용
  - 무료 본문은 **극히 최근 일부**만 (+ RSS 피드의 발췌문은 별도 제공)
- 따라서 **크롤링만으로 전문 아카이브 구축 불가**

### 결론·권장
1. **전문(full-text) 아카이브가 목표라면 크롤링이 아니라 CMS/DB 직접 접근**이 정답
   - 자사 매체이므로 ND소프트 CMS DB 덤프 또는 기사 export 를 받는 것이 가장 깔끔·합법·완전
2. **크롤링으로 가능한 것**: 60,608건의 **메타데이터 인덱스**(제목·날짜·섹션·URL·분류) + 무료 기사 본문
   - 이것만으로도 검색·타임라인·분류 통계·"원문 링크" 제공은 가능
3. **지속 수집(최신 뉴스)**: RSS(`/rss/allArticle.xml`)가 최선 — 이미 `/api/news` 로 구현됨
4. **1990~2001 창간호~초기**: 종이만 존재(미디지털) → 스캔·OCR(#10 OCR) 별도 트랙

## robots/정중성
- `robots.txt`: `/news/` 허용(`/admin/`만 차단), 자사 매체. 그래도 UA 명시·지연·재시도·비피크 권장.
