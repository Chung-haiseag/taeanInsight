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
- 2026-06-22 · 수집 빈도↑: 뉴스·군청목록 6시간 cron(0 */6). 카드뉴스 이미지=군청이 Worker IP 차단→로컬 크롤러 launchd 자동화(tools/gov/run-gov-ingest.sh, com.taean.govingest.plist, 6h)
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
