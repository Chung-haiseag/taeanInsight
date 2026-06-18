# 태안 인사이트 — 운영 런북 (RUNBOOK)

지역 AI 인텔리전스 플랫폼. **시스템 개요 + 운영 절차 + 기능 로그(한 줄씩 누적)**.
새 기능을 추가할 때마다 아래 **§5 기능 로그**에 한 줄 추가한다. 재사용 가능한 패턴은 **§6**.

---

## 1. 스택
- **백엔드**: Cloudflare Workers + Hono (`backend/`) — 단일 Worker, `/api/*` 라우팅.
- **프론트**: Next.js + OpenNext on Workers (`web/`) — 독자 사이트 + `/admin` 검수.
- **저장**: D1 `taean-archive`(기사·검색 `archive_fts`), R2 `taean-archive-photos`(지면·사진).
- **LLM**: Workers AI(무료, AI질의·copilot) / Gemini(디지털화 기사분리) / (옛) Haiku.
- **방침**: Cloudflare-only (노 Vercel/Firebase/NAS). 디지털화는 Vision+Gemini(노 Claude·비용).

## 2. 주요 컴포넌트
| 경로 | 역할 |
|---|---|
| `backend/src/news/` | 뉴스 RSS+목록 수집·전문(로그인)·자동분류 |
| `backend/src/archive/` | 아카이브 검색(FTS/LIKE)·기사·사진서빙·전자북 검수 |
| `backend/src/query/` | AI 질의 RAG(아카이브+실시간 근거, 출처) |
| `backend/src/env/` | 외부 데이터 커넥터(날씨·대기질·관광) |
| `web/src/app/news/[id]` | 독자 기사 화면(원본 지면 줌/팬) |
| `web/src/app/admin` | 관리자 검수(탭·교정·삭제·전체화면 뷰어) |
| `tools/ebook/` | 디지털화 파이프라인 → **PLAYBOOK.md** 참조 |
| `tools/backfill/import-d1.mjs` | JSONL → D1 배치 적재 |

## 3. 운영 명령
```bash
# 배포
cd backend && npx wrangler deploy
cd web && npm run deploy:cf
# D1 마이그레이션
npx wrangler d1 execute taean-archive --remote --file db/migrations/NNN.sql
# 시크릿
npx wrangler secret put <NAME>   # TAEAN_ID/TAEAN_PW(전문), DATA_GO_KR_KEY(날씨·관광)
npx wrangler secret list
# 수동 트리거
curl -X POST https://taean-insight-api.chs9182.workers.dev/api/news/ingest
```
- **Cron**: 매일 자정(KST) = `0 15 * * *`(UTC). 뉴스 수집 + 환경 스냅샷 + 비용 집계.
- 키 위치: GOOGLE_VISION_API_KEY·GEMINI_API_KEY는 디지털화용(로컬 터미널), 나머지는 Worker 시크릿.

## 4. 외부 의존
| 소스 | 용도 | 키 | 상태 |
|---|---|---|---|
| taeannews.co.kr | 뉴스(RSS·목록·전문) | TAEAN_ID/PW | 작동 |
| data.go.kr 기상청 | 날씨 | DATA_GO_KR_KEY | 작동 |
| data.go.kr 에어코리아 | 대기질 | 〃 | 작동(태안항 폴백) |
| data.go.kr TourAPI | 관광·축제 | 〃 | 작동(주간리포트 관광·이벤트 섹션) |
| data.go.kr 국토부 RTMS | 부동산 실거래가(아파트·토지) | 〃 | **활용신청 대기(403)** — 승인 시 자동 활성, LAWD 44825 |
| 국립해양조사원 바다누리 | 조위 | KHOA_KEY | 미연동 |
| Google Vision | OCR | GOOGLE_VISION_API_KEY | 작동 |
| Gemini | 기사분리 | GEMINI_API_KEY | 작동 |

## 5. 기능 로그 (새 기능 = 한 줄 추가)
형식: `YYYY-MM-DD · 기능 · 위치/비고`

- 2026-06 · 옛신문 디지털화 1991~2001 (Vision OCR, ~14k건) · tools/ebook, PLAYBOOK.md
- 2026-06 · 띄어쓰기 transferSpacing(글자보존 이식) · tools/ebook/fix-spacing.mjs
- 2026-06 · 관리자 검수: 탭·본문교정·삭제·원본지면 전체화면 뷰어·저충실도 안내 · web/admin
- 2026-06 · 독자화면: 폭 1280·원본지면 인라인 줌/팬·사진 자연크기·연도 1991~ · web/news,archive
- 2026-06 · 뉴스 자동수집: RSS+기사목록 병합·회원로그인 전문수집·매일자정 cron · backend/news
- 2026-06 · AI 질의 RAG: 아카이브 근거+출처·날씨/대기질 실시간 통합 · backend/query
- 2026-06 · 외부 커넥터: 날씨+대기질(작동)·관광(대기) · backend/env, GET /api/conditions
- 2026-06 · Gemini 기사 재구조화(지면→기사, Vision 재실행 없음) · tools/ebook/restructure-gemini.mjs
- 2026-06 · 주간리포트 MVP: Workers AI 5섹션 초안(목22시 cron)→HITL 발행→/reports 게이팅 렌더·Web Push 자리 · backend/reports, web/reports, db/009
- 2026-06 · 아카이브 검색 속도·페이지네이션: 전자북 거대 썸네일 제거 + 이전/다음(hasMore, COUNT 회피) · backend/archive, web/archive
- 2026-06-18 · 전자북 1995~2001 기사 재구조화 **라이브 반영**(면→기사). 프로덕션 옛 면 레코드 삭제 후 jsonl 32,324건 적재 → D1 41,615건이 jsonl과 1:1 일치. 적재 중 D1 7500 중단 대비 내결함성 재적용 추가 · tools/ebook/reapply-d1.mjs
<!-- 새 기능 추가 시 위에 한 줄 -->

## 6. 재사용 패턴 (다른 프로젝트로)
- **디지털화 파이프라인**: `tools/ebook/PLAYBOOK.md` (PDF→Vision OCR→Gemini 기사분리→D1/R2).
- **D1 적재 재시도**: 네트워크/서버 일시오류 지수 백오프 + 완전한 문장 단위 배치(SQL 절단 방지).
- **장시간 작업 체크포인트/이어하기**: N건마다 저장, 재실행 시 완료분 스킵(restructure-gemini.mjs).
- **검색**: FTS5(트라이그램, 3글자+) + 짧은 질의 LIKE 폴백.
- **RAG**: 질문 키워드 → FTS/LIKE 근거 검색 → LLM이 근거로만 답+출처. 실시간 데이터는 별도 근거로 합성.
- **무료 LLM 경로**: Workers AI(종량 0) / Gemini Flash-Lite(저가) / thinking 끄기(thinkingBudget:0).
- **cron 수집기**: 외부 소스마다 커넥터 1개 → 정규화 → D1. RSS 정체 대비 목록 스크랩 병합.
- **콘텐츠 충실도 가드**: 생성/추출 텍스트 vs 원문 n-gram 겹침, 낮으면 경고/폐기. 공백 무시.
