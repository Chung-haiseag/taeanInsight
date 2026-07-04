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
npx wrangler secret put <NAME>   # TAEAN_ID/TAEAN_PW(전문), DATA_GO_KR_KEY(날씨·관광·실거래가), VAPID_PRIVATE_KEY(Web Push)
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
| taean.go.kr 군정게시판 | 공지·새소식·주간행사·유관기관·카드뉴스 | GOV_IMPORT_TOKEN | 목록(제목·날짜·링크)=**Worker cron 자동**, 본문·이미지=로컬 크롤러(해외IP가 기사view·이미지 차단) |
| data.go.kr 기상청 | 날씨 | DATA_GO_KR_KEY | 작동 |
| data.go.kr 에어코리아 | 대기질 | 〃 | 작동(태안항 폴백) |
| data.go.kr TourAPI | 관광·축제 | 〃 | 작동(주간리포트 관광·이벤트 섹션) |
| data.go.kr 국토부 RTMS | 부동산 실거래가(아파트·토지) | 〃 | 작동(주간리포트 부동산 섹션, LAWD 44825) |
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
- 2026-06 · 주간리포트 MVP: Workers AI 5섹션 초안(목22시 cron)→HITL 발행→/reports 게이팅 렌더 · backend/reports, web/reports, db/009
- 2026-06-20 · 주간리포트 기본 공개 전환(로그인·구독 없이 전체 열람): 파이프라인/스키마 기본값 premiumOnly=0, 기존 발행분 UPDATE · backend/reports/weekly_pipeline.ts, db/010
- 2026-06-20 · 주간리포트 섹션 시각화: 대기질 7일 막대·실시간 스탯카드·실거래 집계/표/레인지바·축제 불릿(라이브러리 무, CSS/SVG) · GET /api/reports/metrics, web/components/reports/report-charts.tsx
- 2026-06-20 · 기상 관측 교정: observedAt 시각 +9h 버그 수정, 정오(12 KST=03 UTC) 환경 스냅샷 cron 추가(자정값 과대습도 보정) · env/sources.ts, index.ts, wrangler crons
- 2026-06-20 · 관광 수요지수 v1(규칙기반: 날씨예보·연휴·축제·계절): 새 키 불요(DATA_GO_KR_KEY) · GET /api/conditions/demand, backend/tour/demand.ts, db/011(백테스트 로그)
- 2026-06-20 · 리포트 관광 섹션에 주말 수요지수 게이지 카드(지수·레벨·주말날씨·기여요인 칩) · reports/metrics.ts→tourism.demand, report-charts.tsx DemandGauge
- 2026-06-20 · 해변 바다 정보(수온·파고): 기상청 해수욕장 서비스(BeachInfoservice, 기존 키·15102239 활용신청). 만리포70·꽃지44. 조석은 KMA 빈값이라 KHOA 대기 · GET /api/conditions/marine, tour/marine.ts, report-charts.tsx MarineCard
- 2026-06-20 · 수요지수에 수온·파고 반영(해수욕 적합도·안전, 6~9월 가중↑): 수온≥24 +12·차가움 −5, 파고≥2.5m −15 등 · tour/demand.ts
- 2026-06-20 · 해수욕지수(국립해양조사원, data.go.kr 1192136/fcstBeachv2·type=json) 추가: 신두리·학암포 지수(5단계)·최대파고·수온·기온·풍속·개장상태. MarineCard 배지+demand 요인(매우좋음+15~매우나쁨−13) · tour/marine.ts
- 2026-06-20 · 밀물/썰물(조석) 완성: 국립해양조사원 조석예보 고저조(data.go.kr 1192136/tideFcstHghLw, obsCode 안흥=DT_0067, extrSe 홀수=고조). MarineCard "오늘의 물때" 블록(만조/간조 시각·조위) · tour/marine.ts
- 2026-06-20 · "이번 주 한눈에 보기" 인포그래픽: 수요지수·기온·대기질·바다수온/파고·다음물때·아파트평균가·축제·군청소식 핵심지표 타일(요약 섹션 상단) · report-charts.tsx SummaryInfographic
- 2026-06-20 · 리포트 음성 듣기(TTS): 브라우저 Web Speech API(무료·서버無), 잠금 안 된 섹션 본문 ko-KR 낭독·문장청크 큐·자연스러운 보이스 우선선택 · report-tts.tsx ReportTTS
- 2026-06-20 · 지난주 대비 추세(▲▼): 인포그래픽 하단 스트립. env_daily 대기질·기온(7+7일, 부족시 절반비교)·tour_demand_log 수요지수(최근 두 주말) · metrics.ts weeklyTrends, report-charts.tsx TrendStrip
- 2026-06-20 · 일출·일몰(NOAA 천문계산, API無)+갯벌체험 추천(간조 기준): 해변 카드에 표시 · tour/marine.ts computeSun/mudflat
- 2026-06-20 · 이달의 제철 태안 먹거리(정적 월별, 꽃게·바지락·천일염 등): 이벤트 섹션 카드 · report-charts.tsx SeasonalFoodCard
- 2026-06-21 · 리포트 발행 알림 구독 버튼(Web Push): 기존 notifications 인프라 재사용, 독자 옵트인→발행 시 자동 발송 · report-push.tsx ReportPushButton
- 2026-06-21 · 충남 주유 평균가(오피넷 avgSidoPrice, OPINET_KEY 시크릿): 휘발유·경유, 전일·전국대비. 부동산·지역경제 섹션 카드 · backend/env/oil.ts, report-charts.tsx OilCard
- 2026-06-21 · 서핑지수(국립해양조사원 fcstSurfingv2, 만리포): 등급별(초급/중급/상급) 지수+파고·주기·풍속·수온. 해변 카드 · tour/marine.ts fetchSurf
- 2026-06-21 · 자외선지수(기상청 LivingWthrIdxServiceV5 getUVIdxV5, 태안군 areaNo 4482500000): 오늘 낮 최고치·등급. 인포그래픽 타일 · backend/env/living.ts fetchUV
- 2026-06-22 · 검색 관심도 선행지표(네이버 데이터랩 검색어트렌드, NAVER_CLIENT_ID/SECRET): 태안 키워드 주간 추세. 지난주대비 스트립 "검색관심도 ▲▼" + 수요지수 요인(급증/급감) · backend/env/search_trend.ts
- 2026-06-22 · 지역설정 중앙화(region.ts) + 안정화: 지역상수 1파일·포팅가이드(docs/REGION_PORTING.md), 외부 API 프로미스캐시 dedup + /api/reports/metrics 엣지캐시 5분(colo당 팬아웃 1회) · backend/lib/cache.ts
- 2026-06-22 · 프론트 지역값(제철먹거리) lib/region.ts 분리 · 수요지수 백테스트 골격(예측 vs 실측 MAE·MAPE·상관, fillActuals 일일적재, GET /api/admin/reports/backtest) · backend/reports/backtest.ts
- 2026-06-22 · 환경·안전 자동 알림(대기질·자외선·파고·기온·해수욕지수 임계, 아침 07KST cron, env_alert_log 멱등) · backend/notifications/env_alerts.ts, db/012
- 2026-06-22 · metrics 사전계산 D1 스냅샷+30분 워밍 cron(콜드 9~16s→0.7s, 전 colo) · backend/reports/metrics_cache.ts, db/013
- 2026-06-22 · 리포트 공유 미리보기 OG/트위터 동적 메타(그 주 요약) · web/app/reports/page.tsx generateMetadata
- 2026-06-22 · 이메일 뉴스레터 구독 수집 토대(email_subscribers, /api/email/subscribe·unsubscribe, 리포트 구독폼). 발송은 도메인온보딩+발송수단(ESP/트랜잭션) 결정 후 · backend/email, db/015
- 2026-06-22 · "지금 태안"(/live) 실시간 현황 공개 페이지(metrics 재사용)+nav 추가. CCTV(ITS/data.go.kr 15040466)는 키 후 추가 예정 · web/app/live
- 2026-06-22 · 뉴스 실시간화: 리포트 뉴스 창을 발행일 고정→최신 리포트는 오늘 기준 14일. /live 최신 태안뉴스 목록 · reports/router.ts
- 2026-06-22 · 수집 빈도↑: 뉴스·군청목록 6시간→12시간 cron(0 */12). 카드뉴스 이미지=군청이 Worker IP 차단→로컬 크롤러 launchd 자동화(tools/gov, 6h)
- 2026-06-22 · 주간 리포트: 초안 금 16시(0 7 * * 5) 자동 생성, 발행은 편집부 검토(HITL) 후 수동(목표 금 17시)
- 2026-06 · 주간리포트 facts 강화: 아카이브45일+TourAPI축제+국토부 실거래가(LAWD 44825) 주입 · backend/reports/facts, env/realestate
- 2026-06 · Web Push 실발송(RFC8291 암호화+VAPID, WebCrypto): 공개 옵트인 /api/push, 발행 시 전구독자 발송 · backend/notifications, db/010
- 2026-06 · 태안군청 군정 게시판 수집: 한국IP 로컬 크롤러→/api/gov/import(토큰), 주간행사계획 등 주간리포트 facts 강화 · tools/gov, backend/gov, db/011
- 2026-06 · 군청 목록 Worker 자동수집(제목·날짜·링크): 목록페이지는 Worker 200 → cron 무료·무기기 갱신, 본문·이미지만 로컬 보충 · backend/gov/list_crawler
- 2026-06 · 아카이브 검색 속도·페이지네이션: 전자북 거대 썸네일 제거 + 이전/다음(hasMore, COUNT 회피) · backend/archive, web/archive
- 2026-06-18 · 전자북 1995~2001 기사 재구조화 **라이브 반영**(면→기사). 프로덕션 옛 면 레코드 삭제 후 jsonl 32,324건 적재 → D1 41,615건이 jsonl과 1:1 일치. 적재 중 D1 7500 중단 대비 내결함성 재적용 추가 · tools/ebook/reapply-d1.mjs
- 2026-06-19 · 전자북 **1990(세로쓰기) 디지털화·라이브**. Vision OCR이 세로조판에 깨져 보류였던 1990을 Gemini 멀티모달이 지면이미지 직접 전사+기사분리(노 OCR·노 Claude). 충실도 우선 flash 단독(루프 시 설정 바꿔 8회 재시도, 실패면 정직한 스텁) — pro는 요약·환각 위험으로 미사용. 31개 호 기사 1,684·스텁 46(2.7%) → D1 1990 1,730건/31호, 전자북 총 43,269 · tools/ebook/digitize-gemini-vision.mjs, gv1990.sh
- 2026-06-19 · 내 페이지(/me) 초개인화 위젯 실데이터화: 오늘의태안(날씨·대기질)·내분야뉴스·맞춤리포트요약·아카이브픽·군정소식 + KPI 실값(— 제거). 위젯별 로딩·에러 격리, 세그먼트별 배치 · web/components/me/widgets,widget_registry
- 2026-06-19 · CORS allowHeaders에 X-Taean-Uid 추가(익명 디바이스 식별 헤더 preflight 차단 → Failed to fetch 해결) · backend/src/index.ts
<!-- 새 기능 추가 시 위에 한 줄 -->

## 6. 재사용 패턴 (다른 프로젝트로)
- **디지털화 파이프라인**: `tools/ebook/PLAYBOOK.md` (PDF→Vision OCR→Gemini 기사분리→D1/R2).
- **D1 적재 재시도**: 네트워크/서버 일시오류 지수 백오프 + 완전한 문장 단위 배치(SQL 절단 방지).
- **장시간 작업 체크포인트/이어하기**: N건마다 저장, 재실행 시 완료분 스킵(restructure-gemini.mjs).
- **검색**: FTS5(트라이그램, 3글자+) + 짧은 질의 LIKE 폴백.
- **RAG**: 질문 키워드 → FTS/LIKE 근거 검색 → LLM이 근거로만 답+출처. 실시간 데이터는 별도 근거로 합성.
- **무료 LLM 경로**: Workers AI(종량 0) / Gemini Flash-Lite(저가) / thinking 끄기(thinkingBudget:0).
- **cron 수집기**: 외부 소스마다 커넥터 1개 → 정규화 → D1. RSS 정체 대비 목록 스크랩 병합.
- **해외IP 차단 소스**: 일부 관공서(taean.go.kr 기사view)는 데이터센터/해외 IP에 500 → Worker fetch 불가. 한국 IP 로컬 크롤러가 수집·파싱 후 토큰 API로 적재(수집=로컬, 쓰기=Worker).
- **콘텐츠 충실도 가드**: 생성/추출 텍스트 vs 원문 n-gram 겹침, 낮으면 경고/폐기. 공백 무시.

- 2026-06-22 · 관리자 주간리포트 검수·발행 탭(초안 미리보기·거버넌스 사전검사·발행/회수) + 회수 API · web/admin, GET /api/admin/reports/current, POST .../unpublish

- 2026-06-22 · 홈 라이브 요약(GenericHome) + "N년 전 오늘 태안" 회고(/live, GET /api/archive/on-this-day) · web/home, archive/router

- 2026-06-23 · 초개인화: 사장님 홈(OwnerHome) 실데이터화 + 가게 프로필(업종·읍면). owner-brief 룰엔진(수요×날씨×물때×업종) · backend/owner/brief.ts, db/016, web/home/owner-home

- 2026-06-23 · 온보딩에 가게 프로필 스텝 추가(사장님·기관 유형 조건부, 업종·상호) → owner-brief 맞춤 · web/me/onboarding, backend/preferences

- 2026-06-23 · 사장님 실행제안 규칙엔진 고도화(추세·주말강수·파고·대기질·기온·시간대·업종세분화 + 우선순위/태그) · backend/owner/brief.ts

- 2026-06-23 · 팀(B2B)·부서(B2G) 공유 워크스페이스(공유코드 가입·멤버·공유자료·공유메모) placeholder→실구현 · backend/workspace, db/017, web/me/workspace-panel

- 2026-06-23 · 도로 실시간 CCTV(ITS) 라이브: 태안 국도 39곳, /live HLS 플레이어. ITS 9443포트는 Worker 불가→로컬 크롤러(launchd 30분) D1 미러 · tools/cctv, GET /api/conditions/cctv, db/018

- 2026-06-23 · 해안 해무 CCTV 스틸컷(국립해양조사원 seafogCctv, 대산항·평택당진항 10분 단위) · /live, GET /api/conditions/seafog, backend/env/seafog.ts

- 2026-06-23 · "역대 오늘, 태안": 같은 일자(MM-DD) 과거 주요뉴스 랜덤(±3일 보강·광고배제) · GET /api/archive/on-this-day

- 2026-06-23 · 태안뉴스 로딩 가속: D1 캐시(news_cache, SWR)+30분 워밍 cron(3.5s→0.85s, workers.dev 엣지캐시 불가 대응) · backend/news, db/019

- 2026-06-23 · 성능: 해무/역대오늘 D1 캐시(api_cache, db/020)+30분 워밍, /live 병렬화 → /live 3.0s→1.5s·해무 9.5s→0.7s · backend/lib/api_cache.ts

- 2026-06-23 · 시민기자 에디터 UX: 임시저장(localStorage)·미리보기·글자수·모바일(sticky 제출) · web/citizen/write

- 2026-06-23 · 시민기자 키워드→AI 초안 생성(POST /api/copilot/draft, Workers AI, 날조방지 [확인필요] 마커) → 기자 수정·HITL · backend/copilot, web/citizen/write

- 2026-06-23 · 시민기자 사진 업로드(R2, POST /api/copilot/upload, citizen/ 키) + 본문 ![](url) 삽입·미리보기 렌더 · backend/copilot, web/citizen/write

- 2026-06-23 · 시민기자 기사 CRUD/목록(D1 citizen_articles, /api/citizen/articles, uid 소유)+내 기사 페이지+에디터 초안저장/수정 연동 · backend/citizen/articles_router, db/021, web/citizen/articles

- 2026-06-23 · 시민기자 검수 루프 완성: 관리자 제출기사 검수(승인→published/반려→rejected+사유)→내 기사 반영 · backend/citizen/router(submissions), web/admin

- 2026-06-23 · B2B 대시보드 정체성 확립+실재화: 지역 데이터 분석(시계열·기간필터·CSV). GET /api/dashboard/series·export · backend/dashboard, web/dashboard

- 2026-06-23 · IA 중첩 정리(feat/ia-cleanup): 화면 역할 경계 명확화 — 정본+딥링크 교차링크(/me↔live·dashboard, live↔dashboard, reports→live) · web 다수

- 2026-06-23 · AI질의 RAG 근거 확장: 실거래(읍면필터·추이)·관광수요·축제·바다(일출몰·물때·수온) 주입 + bm25·출처정제·충실프롬프트 · backend/query/router

- 2026-06-23 · AI질의 행사: 군청 주간행사 PDF 첨부 일정 추출(pdftotext)·본문 적재 → 요일별 상세 일정 답변 · tools/gov/ingest-gov.mjs(extractPdfText), backend/query

- 2026-06-24 · 모텔(숙박) 특화: 사장님 홈 "모텔 운영 보드"(객실수·주말가 입력→예상 가동률·권장가·매출, 축제/우천 보정) · backend/owner/brief, web/owner-home

- 2026-06-24 · 모텔 보드: 주변 숙박업소 수(TourAPI searchStay2)+실시간 요금 외부링크(야놀자·여기어때·네이버) · backend/env/tour, owner/brief

- 2026-06-24 · 시민기자 에디터 "관련 과거 보도" 패널: 작성중 주제로 아카이브 FTS5·BM25 검색(무LLM) 5건 사이드 카드 · POST /api/copilot/related, web/citizen/write

- 2026-06-24 · 시민기자 에디터 "데이터 넣기": 날씨·물때(안흥)·해돋이/해넘이를 출처표기 텍스트로 본문 삽입(공공데이터 재사용) · GET /api/copilot/context-data, web/citizen/write

- 2026-06-24 · 시민기자 AI보조에 "사실 점검" 모드(본문서 수치·날짜·고유명사·인용 추출→체크리스트, 새 사실 창작 금지) · backend/copilot ASSIST_PROMPTS.factcheck

- 2026-06-24 · 시민기자 에디터 보완: 사진 캡션·촬영자 입력(alt 반영)·제출전 작성가이드 체크리스트(역피라미드·5W1H·균형, 비강제)·실시간점검 PII 실제문구 노출 · web/citizen/write, /api/copilot/check samples

- 2026-06-24 · 사장님 업종 보드 5종: 숙박(가동률·권장가)·음식·카페(혼잡도·손님)·레저(적합도·참가자)·소매(방문·매출) — owner/brief, owner-home, onboarding

- 2026-06-24 · 사장님 업종 보드 확장: 낚시·수산(출항 가부·물때·선상매출)·염전(채염 적기)·농업(영농 기상 경보) — owner/brief, owner-home, onboarding

- 2026-06-24 · 개인 페르소나: 주말 태안 여행 플래너(날씨·일출몰·갯벌간조·혼잡·축제) — /me, owner-brief에 sun 추가

- 2026-06-24 · 업종 보드 3종 추가: 부동산 중개(실거래 시세·㎡단가·읍면)·골프장(라운딩 적합도·내장·매출)·양식수산(수온·적조 경보) — owner/brief, owner-home, onboarding

- 2026-06-25 · 주간 개인화 푸시(금 09:00 KST): 구독자에게 본인 업종 보드/여행 플래너 요약 Web Push — owner/weekly_push, cron 0 0 * * 5

- 2026-06-25 · AI 질의에 내 가게 연결: "우리 모텔 이번 주말 어때?" → shopProfile 보드 수치로 답변 — query/router buildShopEvidence(X-Taean-Uid)

- 2026-06-25 · 품질: AI 질의 타지역 가드(서울·강남 등 태안 외 → 태안 데이터 오표기 차단·전용 안내), mock 점검(/me만 데이터버그였고 수정됨; 홈·뉴스는 데모 게이트로 데이터는 실제) — query/router

- 2026-06-25 · A형 포팅 중앙화 완성: 읍·면 목록·지역지명·작물·양식품종을 region.ts(backend)·region.ts(web)로 통합. 읍면 코드 backend/frontend 일치(taean_eup→taean 버그 수정). docs/REGION_PORTING 갱신

- 2026-06-25 · VAPID 푸시 실발송 검증 완료(sent:1, FCM 수신). 본인 테스트 발송 엔드포인트(/api/me/push-test)+UI "테스트 알림" 버튼, 관리자 즉시발송(/weekly-send-now) — preferences/router, push_opt_in

- 2026-06-25 · 독자 초개인화 Phase 1(추가형): 기사 체류·스크롤 로그(reading_events)+행동 기반 "실시간 픽"(/me)+독자유형(정독/스캐너). backend/reading, reading-tracker, me/reader-picks. mig 022

- 2026-06-25 · 독자 초개인화 Phase 2: Cloudflare Vectorize(taean-articles, bge-m3 1024d) 기사 임베딩 맥락 추천. 읽은 기사 벡터 평균→최근접 기사(/me 실시간 픽 "맥락 기반"). 12h cron 임베딩 적재 + 관리자 백필(/embed-recent). backend/reading, wrangler vectorize 바인딩

- 2026-06-25 · 독자 초개인화 Phase 3: AI 3줄 요약(스캐너·온디맨드·D1캐시 /api/reading/summary)+시간대 컨텍스트(출근 브리핑/낮/저녁 깊이읽기/심야). reading/router, me/reader-picks

- 2026-06-25 · 기자 취재 알림(Coverage Alert): 군청 새 공지·기상특보·데이터 급변·키워드 감지→기자 Web Push. /reporter(등록·키워드·인박스), 30분 cron, 멱등(ref_key)·최근3일 필터. backend/reporter, mig 023

- 2026-06-26 · PWA 설치형 전환: manifest.webmanifest + 아이콘(192/512/apple180/badge, Node zlib 생성) + layout 메타. iOS "홈 화면에 추가"→Web Push 활성화. web/scripts/gen-icons.mjs

- 2026-06-26 · 버그픽스: /api/push/subscribe가 구독을 항상 "anon"으로 저장→개인화 푸시(테스트·주간·취재)가 본인 구독 못 찾던 문제. X-Taean-Uid로 저장 + PushOptIn 마운트 시 자동 재등록(자가치유). notifications/router, push_opt_in

- 2026-06-26 · 기자 취재 알림 개선: 군청 공지 본문 발췌(140자) 포함 + 여러 건은 묶음(다이제스트) 1건으로 발송(13건→1푸시). reporter/alerts

- 2026-06-28 · 관리자 인증: /api/admin/*·/api/cost를 ADMIN_TOKEN(X-Admin-Token)으로 보호(미설정 시 503 잠금). /admin 비밀번호 게이트(sessionStorage)+로그아웃. index.ts adminGuard

- 2026-06-29 · IA 단순화: B2B 대시보드를 주간 리포트 "데이터 부록"으로 흡수(RegionDataPanel), 메뉴 제거, /dashboard→/reports#data 리다이렉트, 관련 링크 재지정

- 2026-06-29 · 주간리포트 자동발행(B안): 금 cron 초안생성 후 거버넌스 통과 시 자동 발행(막히면 초안 유지). /admin 토글+수동 점검, on/off는 D1(api_cache). reports/scheduled autoPublishIfClean

- 2026-06-29 · 취재 알림 → AI 기사 초안 연결: /reporter 알림 "📝 기사 초안" → POST /api/reporter/draft(알림내용+관련 과거기사 RAG→Workers AI 보도 초안, [확인 필요] 마커)→ /citizen/write 핸드오프(sessionStorage). reporter/router, reporter·citizen 페이지

- 2026-06-29 · 오디오 뉴스 MVP: 기사 제목+발췌→Workers AI MeloTTS(한국어, WAV)→R2 캐시(audio/news/<idxno>.wav)→스트리밍. 기사 상세 "🔊 기사 듣기". backend/audio, news-audio

- 2026-06-30 · 오디오 뉴스: MeloTTS(한국어 품질 불가, STT 역검수로 확인) 제거→브라우저 Web Speech(ReportTTS) 사용. 기기에 한국어 음성 없으면 영어 폴백 차단+안내. 신뢰성 위해선 클라우드 TTS(Google/Naver) 필요(키)

- 2026-06-30 · 오디오 뉴스: Google Cloud TTS(ko-KR Neural2)로 전환. 서버 mp3→R2 캐시(audio/news/N.mp3), 기사 "🔊 기사 듣기"(NewsAudio). GOOGLE_TTS_KEY 시크릿 필요(미설정 시 503·안내). backend/audio

- 2026-06-30 · 출근길 오디오 브리핑: 최근 주요 뉴스 5건을 한 편 음성으로(Google TTS)·날짜별 R2 캐시. /me에 시간대별 라벨(출근길/오늘/저녁) 플레이어. backend/audio/briefing, briefing-audio

- 2026-06-30 · 주간 AI 팟캐스트(B안): 주간 리포트→Workers AI 2인 대담 대본→Google TTS 2-보이스(수아 여/준호 남) 합성·이어붙임→주차별 R2 캐시. /reports 플레이어. backend/audio/podcast, podcast-audio

- 2026-06-30 · 팟캐스트 품질 개선: Chirp3-HD 음성(기계음↓)+줄 사이 무음 450ms(끊김·쉼↓)+대담 프롬프트 개선(맞장구·질문). 오디오 응답 cache-control private(엣지 stale 차단). backend/audio

- 2026-06-30 · 팟캐스트 Gemini 멀티스피커(NotebookLM급) 옵션: GEMINI_API_KEY 있으면 gemini-2.5-flash-preview-tts 멀티스피커(2인 한 번에·WAV), 없으면 Chirp3-HD 폴백. PCM→WAV 래핑. backend/audio

- 2026-07-01 · 팟캐스트 Gemini: Worker에서 Gemini API 지역차단("User location not supported", 텍스트·TTS 모두) 확인 → Worker는 Chirp3-HD 유지, 로컬(한국IP)이 audio/podcast/<주차>-gem.wav 올리면 우선 서빙하도록 변경. backend/audio

- 2026-07-01 · 주간 팟캐스트 로컬 생성기(tools/podcast): 맥(한국IP)에서 Gemini 멀티스피커(NotebookLM급) 생성→R2 audio/podcast/<주차>-gem.wav 업로드, Worker 우선 서빙. launchd 금 18:00 KST. 키=env GEMINI_API_KEY

- 2026-07-01 · 기사 듣기·브리핑 음성 Neural2→Chirp3-HD 업그레이드(자연스러움↑). Chirp3-HD 긴문장 거부 대응: 문장 청크 병렬 합성·이어붙임(synthLong). 첫생성 31s→7s. 캐시키 -hd. backend/audio

- 2026-07-01 · TTS 음성 정규화: 가운뎃점(·)→쉼표, 숫자범위(18~45)→"에서", 괄호→휴지, 단위(㎡㎞) 한글화. googleTts 진입점 적용(기사·브리핑·팟캐스트 폴백). 캐시키 -hd2. backend/audio

- 2026-07-01 · 기사 낭독 Gemini(무료) 옵션: tools/news-audio 로컬 생성기(무료 키 victory·holyroad 로테이션, 키당 15건→하루 ~30건 무료)→R2 audio/news/<idxno>-gem.wav, Worker 우선 서빙(없으면 Chirp3-HD). launchd 07:00. 유료 위험 0(초과분 Chirp3-HD 폴백)

- 2026-07-01 · 태안뉴스 최신만: /api/news 최근 60일 필터(최소 20건 보장), 그 이전은 /archive. 8개월 69건→최근 34건. news/router

- 2026-07-01 · 태안뉴스 최신순 고정: 관심사 개인화 재정렬 제거(관심분야를 앞으로 끌던 것)→발행일 내림차순만. 관심사는 강조용으로만 전달. news/router

- 2026-07-01 · 태안뉴스 회차 누락 보강: 라이브 수집이 6/19 등 일부 회차 누락 → 완전한 D1 아카이브(최근 35일) 병합·중복제거. 기본 상한 60건(최신 3회차), D1 바인드 100 한도 보호(500 수정). news/router

- 2026-07-01 · 오디오 자동화 완성: setup-launchd.sh(팟캐스트 금18시+기사낭독 매일7시 원클릭 설치), 생성기가 audio/status.json 기록, GET /api/audio/status(현황), /admin 오디오 자동생성 현황 카드

- 2026-07-01 · 운영·분석 대시보드: /api/admin/analytics(reading_events 조회·체류·스크롤, 인기기사 Top10, 카테고리, 일별추이, 온보딩·푸시 규모, 세그먼트). /admin "📊 분석" 탭. analytics/router

- 2026-07-01 · 이벤트 추적 확장: usage_events 테이블(024) + POST /api/reading/track. 오디오 재생(기사·브리핑·팟캐스트)·AI질의 기록. 분석 대시보드에 오디오재생·AI질의 KPI + 인기질의·오디오분포

- 2026-07-01 · 계정·로그인(Cloudflare 네이티브): users/sessions(025), Web Crypto PBKDF2, D1 세션토큰. 익명 uid를 계정에 귀속→로그인 시 정규 uid 반환으로 기기간 개인화 동기화. /login, 헤더 계정표시, auth/router

- 2026-07-01 · 내 관심사 팟캐스트(/me): 관심 카테고리 최신 뉴스→Workers AI 2인 대담→Chirp3-HD 2보이스, uid·날짜별 캐시. GET /api/audio/me-podcast. (Gemini는 Worker 지역차단이라 per-user는 Chirp3-HD)

- 2026-07-01 · 오디오 브리핑을 2인 대담 팟캐스트로 전환(synthNewsPodcast 공용화). 별도 "내 관심사 팟캐스트"(me-podcast) 삭제. /me 브리핑=출근길/저녁 뉴스 팟캐스트

- 2026-07-01 · 오디오 재생 실패 수정: 큰 파일(팟캐스트 9MB·Gemini 기사 5MB) blob 다운로드 중 사용자 제스처 만료→자동재생 차단. 직접 스트리밍(el.src+즉시 play)으로 전환(팟캐스트·기사·브리핑)

- 2026-07-02 · 공유·SEO: 기사별 OG 메타(카카오톡 카드 — 제목·발췌·대표사진), /api/news/:id 아카이브 보강(excerpt·leadImage), 기본 og.png(1200x630), sitemap.xml·robots.txt, 루트 og:image. 기사 페이지 서버/클라 분리(generateMetadata)

- 2026-07-02 · 동적 OG 이미지: /api/og(next/og ImageResponse, 제목 그린 브랜드 카드, 한국어 Do Hyeon TTF 런타임로드·모듈캐시). 대표사진 없는 기사·리포트 og:image로 사용. (OpenNext: runtime=edge 금지, woff 비호환→ttf)

- 2026-07-02 · 카카오 로그인(OAuth): users provider/provider_id(026), /api/auth/kakao/start·callback(code→토큰→프로필→계정 생성/로그인→세션), 익명 uid 귀속. /login "카카오로 시작". KAKAO_REST_KEY 시크릿 필요

- 2026-07-02 · 언론 클리핑 자동화: news_clips(027)+네이버 뉴스검색(태안군·안면도 등, 자사 제외), 12h cron 수집, GET /api/clips, /reporter "언론 클리핑" 피드. ⚠️네이버 앱에 검색 API 추가 필요(현재 데이터랩만→401)

- 2026-07-02 · 일간 클리핑 다이제스트: 매일 07시 KST(0 22 * * *) 지난 24h 태안 외부보도를 기자에게 Web Push 1건 묶음("📰 태안 언론보도 N건"+상위4). clips/sendClippingDigest

- 2026-07-02 · VPS 공존 배포 패키지(tools/vps): 기존 카페24/리눅스 VPS에 taean- 네임스페이스 systemd 4개(군청6h·CCTV30m·팟캐스트금18시·기사낭독매일7시). 통합 taean.env, install.sh(node·poppler·wrangler), Cloudflare API 토큰으로 헤드리스 D1/R2. data.go.kr·네이버는 Worker 유지

- 2026-07-02 · 계정 완성: /account 설정(이름변경·비번변경·탈퇴), POST /api/auth/{profile,change-password,delete}(세션 토큰 검증, 소셜은 비번 제외, 비번변경 시 타 세션 무효화). 헤더 이름→/account

- 2026-07-02 · 보안 리뷰 수정: 카카오 OAuth 리다이렉트 호스트 화이트리스트(오픈리다이렉트=계정탈취 방지), /clips/run fail-closed, 잔존 디버그 라우트 제거(reporter/_runtest·env/_debug_tour·_debug_realestate)

- 2026-07-03 · 레이트리밋(Cloudflare 네이티브 ratelimits 바인딩): LOGIN_RL 8/60s(로그인·가입 무차별대입), AUDIO_RL 30/60s(오디오 온디맨드 생성 남용). CF-Connecting-IP 키. 429 반환

- 2026-07-03 · 수익화 기반: /membership(3플랜 패키징+사전신청 leads, 028) + /admin "💎 성과" 탭(자동화 환산가치·아카이브 자산·독자기반·수요검증 — /api/admin/analytics/roi, 산정식 병기). 네비 멤버십 추가

- 2026-07-03 · 자동작업 현황(/admin ⚙️ 자동화): 10개 파이프라인(뉴스·군청·CCTV·클리핑·공공데이터·환경일일·리포트발행·팟캐스트·기사낭독·취재알림) 최근실행·결과·신선도(주기×2 초과 ⚠️). GET /api/admin/analytics/jobs. 구 오디오 카드 대체

- 2026-07-03 · 회원 구분 체계: users.role(user/reporter/admin)+plan(free/reader/business/org)(029). /admin 👥회원 탭(역할·플랜 부여), /api/admin/users. 취재알림 메뉴·페이지 기자 전용(비기자 안내), /api/reporter/draft 등록기자만(403), 리포트 게이팅에 계정 plan 연동(planTier). /api/auth/me role·plan 반환

- 2026-07-03 · 기자 전용 초안 에디터(/reporter/write): 취재알림→AI초안 핸드오프 목적지를 시민기자 에디터에서 분리. 다듬기·제목제안·사실점검(copilot 재사용)+복사·다운로드(제출·검수 흐름 없음, 신문사 편집시스템으로 가져가는 용도). 기자 전용 게이트·자동 임시저장

- 2026-07-03 · 공용 PageHeader 컴포넌트: 9개 페이지(뉴스·아카이브·지금태안·내페이지·취재알림·기자에디터·멤버십·시민기자 에디터·내기사) 헤더를 한 규격으로 통일(간격·타이포·강조선 편차 제거, eyebrow/제목/설명/actions/center 지원)

- 2026-07-04 · 카드 토큰 통일(.card·.card-accent): 테두리 brand/10·/12·/15·배경 bg-background·bg-white/60·그림자 shadow-card·shadow-soft로 갈리던 카드 28곳을 2종 유틸로 수렴(패딩 보존, bg-background로 고대비 테마 대응 개선)

- 2026-07-04 · 이모지 절제(공개페이지): 섹션 제목 장식 이모지 제거(📡🔔🔎📨📰📚🏪💡✨🛡🤖 등) — 취재알림·기자에디터·시민기자·사장님보드·기사상세. 유지: 날씨·바다 데이터 카테고리(⛅🌊), 업종 아이콘, 상태(⚠✅), 기능버튼(📋💾), 카카오(💬). 관리자 내부도구는 유지

- 2026-07-04 · 지금태안 헤더 실시간 시계(LiveClock): KST 기준 오늘 날짜·요일 + 시:분:초 매초 갱신, PageHeader actions 슬롯 우측 배치. 하이드레이션 안전

- 2026-07-04 · 태안뉴스 낭독 자연도 개선: Chirp3-HD 청크 170→550자(여러 문장 묶어 이음새 감소, 기사당 7→2조각). 캐시키 -hd3→-hd4로 구캐시 무효화. (Gemini -gem.wav 자연음성은 무료할당이 최신기사 못 따라가 Chirp3 폴백이 자주 들리던 문제)
