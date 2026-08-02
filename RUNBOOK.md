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

## 4.1. 지식그래프(KG) 운영 — Day-2 절차
- **타입/관계 추가(additive)**: `/api/admin/kg`(온톨로지 관리) 또는 kg_ontology INSERT → 새 노드/엣지 즉시 허용. 코드·DB 마이그레이션 불필요.
- **새 군수/인물 추가**: 관리자 폼에서 person 노드 + held 엣지 등록 후 verify. 출처 필수.
- **검증 원칙**: verified=1은 source 필수. 답변엔 verified=1만 노출. 지어낸 값 금지.
- **파괴적 변경(이름변경·병합·삭제)**: 마이그레이션 + 사용자 승인 + 백업.
- **원격 마이그레이션**: `npx wrangler d1 execute taean-archive --remote --file db/migrations/NNN.sql` (승인 후).
- **군수 계보 대상 직위 `office:taean-gunsu` 노드**: 마이그레이션 033에서 자동 시드됨. 인물·역임은 `/admin/kg` 폼으로 검증 입력.
- **역임(held) 엣지 ID 규칙 및 수정**: 엣지 id는 `held:office:taean-gunsu:<대수(ordinal)>`로 결정. 대수를 잘못 입력했으면 (1) 올바른 대수로 다시 등록하고 (2) 잘못된 엣지를 미검증 처리: `POST /api/admin/kg/verify {"table":"kg_edges","id":"held:office:taean-gunsu:<잘못된대수>","verified":false}` (미검증 엣지는 답변에 노출되지 않음).
- **동명이인 병합(soft canonical_id)**: 동명이인 여러 person 노드를 soft_canonical_id로 묶음. 후보 탐지: `node tools/kg/merge-candidates.mjs` → `/admin/kg` 검수 탭에서 병합(canonical 지정·기타 노드 병합). soft_canonical_id 그룹은 관계도·RAG에서 단일 대표로 검색·답변.
- **엣지 라벨 생성(Gemini 관계유형)**: `export GEMINI_API_KEY=...` → `node tools/kg/label-relations.mjs [--limit N]` (~3,880 엣지, ~$0.4). weight≥10 coappears에 reltype 자동 추출.

### KG 인물 추출 실행(3단계)
- 전제: `export GEMINI_API_KEY=...`(터미널), 034 원격 마이그레이션 적용.
- 추출: `node tools/kg/extract-persons.mjs <연도...> [--limit N] [--conc 4]` → out/kg_mentions.jsonl (체크포인트로 이어하기).
- 적재: `node tools/kg/apply-kg.mjs [--dry]` → kg_nodes(person, verified=0)+kg_mentions (원격 D1, 승인 후).
- 파생: `node tools/kg/derive-coappears.mjs [--dry]` → kg_edges(coappears, verified=0).
- 원칙: 자동추출은 verified=0 → AI 답변 미주입. 파일럿 연도로 먼저 검증 후 확대. 동명이인 분리는 4단계 검수 콘솔.

## 5. 기능 로그 (새 기능 = 한 줄 추가)
형식: `YYYY-MM-DD · 기능 · 위치/비고`

- 2026-08-02 · 해변 바다 정보(MarineCard) 콤팩트화: 서브블록 여백 mt-4→3·패딩 p-4→3, 일출일몰/서핑 축소, 오늘의 물때 셀 py 축소+시각 text-base→15px+auto-fit(빈칸 제거·전폭 균등), 해변 카드 값 text-xl→base·라벨 11px·간격 축소. /live·리포트 공통. web/src/components/reports/report-charts.tsx
- 2026-08-02 · /live 날씨+대기질 한 카드로 통합(중복 제거): 별도이던 WeatherCards(기온·습도·하늘·통합대기)+실시간대기질(PM10·PM2.5)을 WeatherAirCard 하나로 — 통합대기 등급 배지+관측시각을 카드 상단에 1회, 날씨 3칸+대기질 2칸+PM설명. 통합대기·관측시각 중복 해소. /live만 적용(주간리포트는 기존 유지). web/src/components/reports/report-charts.tsx·app/live/page.tsx
- 2026-08-02 · 대기질: 다일 추세 차트→오늘 실시간 카드로 단순화(알기 쉽게 요청): AirQualityTrend를 7일 막대 추세에서 '실시간 대기질' 카드로 교체 — 미세먼지(PM10)·초미세먼지(PM2.5) 2칸에 현재값+등급(좋음/보통…)+등급색 배경, 헤더에 관측시각·통합대기 등급, 하단 PM 설명 유지. 미사용 Pill/PmPill 정리(md는 표에서 계속 사용). /live·주간리포트 공통. (env.live 결측 시 자동 숨김) web/src/components/reports/report-charts.tsx
- 2026-08-02 · /live 데이터 카드 밀도 2차(전체 촘촘): report-charts 공용 카드 여백·패딩 일괄 축소(mt-6→mt-4·card p-5→p-4, 8곳). WeatherCards p-4→p-3·값 text-xl→lg, 대기질 차트 8→6.5rem, 수요지수 text-4xl→3xl. 날씨·바다·관광·경제 카드 전부 균일 압축. 리포트 페이지에도 공유 적용. web/src/components/reports/report-charts.tsx
- 2026-08-02 · /live 밀도 개선(정보가 너무 큼 피드백): 핵심지표 인포그래픽(SummaryInfographic)을 고정 grid-cols-4(5타일→빈칸3) 에서 auto-fit minmax(140px)로 → 타일 수만큼 한 줄 꽉 채워 빈칸 제거, 셀 축소(py-5→py-3·text-2xl→text-lg·이모지 축소). /live 섹션 제목 9개 text-display-sm→text-xl, 간격 space-y-10→8. 인포그래픽은 홈에도 공유돼 동반 개선. web/src/components/reports/report-charts.tsx·app/live/page.tsx
- 2026-08-02 · 상단 헤더 2행 분리(메뉴 줄바꿈 정리): 한 줄에 로고+메뉴9+글자크기+고대비+계정을 몰아넣어 1200px에서 메뉴 라벨이 단어 중간 줄바꿈되던 문제(특히 최종관리자 9개). 태안신문식 2행으로 — 1행(로고·접근성·계정), 2행(메뉴 전용 바, whitespace-nowrap·shrink-0·overflow-x-auto). 메뉴가 자체 행이라 넉넉·무줄바꿈. web/src/components/site-header.tsx
- 2026-08-01 · 팟캐스트 인트로·아웃트로 음악 합성(로고송): 사용자 제공 음악(intro·outro.mp3, tools/podcast/assets/)을 ffmpeg로 합성. 인트로는 6초로 트림(introLen 기본 6, 원본 파일 보존). **인사말과 겹치지 않게** 크로스페이드 대신 순차 연결(concat) — [인트로 페이드인→페이드아웃]→0.35s공백→[말소리 원본]→0.35s공백→[아웃트로 페이드인→페이드아웃], +21.1s(인트로6+아웃14.4+공백0.7). 공용 헬퍼 tools/podcast/mix-music.mjs(assets 없으면 원본 폴백), gen-podcast·gen-briefing 업로드 직전에 연결→향후 회차 자동 적용. 기존 6편(2026-W26~W31) 백필 재합성·R2 교체(원본 로컬 백업). 라이브 확인 6편 원본+21.1s. tools/podcast/{mix-music,gen-podcast,gen-briefing,assets}
- 2026-08-01 · 주간 팟캐스트 다시듣기(회차 리스트): 기존은 /api/audio/podcast가 최신 1개만 서빙 → 지난 회차 청취 불가. 백엔드에 GET /api/audio/podcast/episodes(R2 audio/podcast/ 목록에서 -gem 있는 주차 집합 podcastWeekIds[순수·테스트]를 발행 리포트와 교집합) + GET /api/audio/podcast/:weekId{ISO주차 정규식}(주차별 Range 서빙, /episodes와 라우트 비충돌) 추가. 프런트 listPodcastEpisodes + PodcastEpisodes 컴포넌트(회차별 인라인 WebAudio, 재생 시에만 로드) → 리포트 상단 '이번 주 팟캐스트' 바로 아래로 배치(오디오 한 묶음, 현재 주차 excludeWeekId로 제외). 검증: 6회차(2026-W26~W31)·2026-W31 206 스트리밍. (라디오 MVP는 보류, 이것만 진행) backend audio/{manifest,router}+test, web reports/{podcast-episodes,page}·api/reports
- 2026-08-01 · 사이트 콘텐츠 폭을 태안신문과 실측 일치(피드백 '폭이 좁다'): 콘텐츠가 max-w-4xl(896)로 좁던 것을, 태안신문(taeannews.co.kr) 콘텐츠 컨테이너 실측(.mode-inner 1200px)에 맞춰 셸 전체를 max-w-[1200px]로 통일 — 레이아웃 main·site-header·site-footer·admin-header + 그리드/목록/대시보드 8개 페이지(홈·뉴스목록·라이브·인물·시민기자·취재알림·내페이지·멤버십). 로고·콘텐츠 좌측 라인 정렬, 우리 main 폭 브라우저 실측=1200px. 읽기 전용 3개(기사본문·리포트리더·질의답변)는 max-w-4xl 유지(한국어 본문 가독성·태안신문도 기사 칼럼은 좁음). web/src/app/*·components/{site-header,site-footer,admin-header}
- 2026-08-01 · 비로그인 첫 화면(GenericHome) 콘텐츠·디자인 강화(방문자 첫인상): 기존 얇은 홈을 실데이터 기반 5블록으로 재구성 — ①히어로(정체성+실수치 증거 10만4천건·1990–2026·100% 편집부검토, CTA 질의/아카이브/리포트) ②실시간 '지금 태안'(LiveSummaryStrip) ③대표 콘텐츠 쇼케이스 4카드(질의응답·아카이브 getArchiveStats 실count·옛신문 디지털화 1990–2001·인물 관계망, Phosphor 라인아이콘 칩) ④실제 최신 기사(PersonalizedNewsStrip) ⑤저널리즘·신뢰 네이비 블록(편집부검토·시민기자단·주간리포트). 사용자 선택 방향=대표콘텐츠+실시간+저널리즘+최신기사 전부. 기존 디자인시스템(brand navy·teal accent·eyebrow·hairline·card-lift) 유지, 숫자는 archive/stats 실데이터·배지 남발 금지. web/src/components/home/generic-home.tsx
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
- 2026-07-09 · 메인 홈 초기 렌더 폭 점프 제거: SSR·하이드레이션 전 GenericHome이 7xl로 떴다 4xl로 스냅되던 CLS 해소(state===null 분기도 max-w-4xl 래퍼로 통일) · web/src/app/page.tsx
- 2026-07-17 · 태안뉴스+아카이브를 '뉴스아카이브' 단일 메뉴로 통합(첫 화면 최신순·탭 건수·전체검색) · web /news, backend /api/archive/stats
- 2026-07-22 · AI질의 웹RAG provider에 네이버 검색 추가(뉴스=최신 지역보도 sort=date, 웹문서=공식 .go.kr 화이트리스트). NAVER_CLIENT_ID/SECRET 있으면 네이버 우선, 없으면 Tavily 폴백. 스니펫 기반(원문 fetch 없음). 대화체 질의 정리+HTML 제거. 웹 출처는 답변 인용 시 노출 · backend src/query/web/{naver,search}.ts
- 2026-07-22 · AI질의 외국문자 누수 최후 방어: 병렬 생성이 모두 누수여도 잔여 한자·가나만 제거해 정상화(stripForeignLetters) · backend src/query/answer_quality.ts
- 2026-07-23 · 질의응답 화면 개선: 답변 번호목록 구조화 렌더(AnswerView·parseAnswer, 빈 괄호 정리) + 검색 중 파이프라인 단계 진행 표시(SearchProgress, 지표형) · web src/app/query/
- 2026-07-23 · AI질의 영어 단어 누수 감지: 한글에 붙은 소문자 4자+ 영단어("existed하며")를 붕괴로 판정해 재생성 회피(약어·고유명사는 오탐 방지) · backend src/query/answer_quality.ts
- 2026-07-23 · 주간리포트 PDF 세로 잘림 해결: 긴 섹션의 break-inside:avoid가 한 페이지 넘는 섹션을 잘라내던 문제 → 섹션은 break-inside:auto로 이어지게, 작은 단위만 유지. @page A4 여백·이미지 폭 맞춤 · web src/app/globals.css @media print
- 2026-07-23 · 주간리포트 외국문자 누수 방어: 생성 시 붕괴 재생성+최후 제거(weekly_pipeline), 이미 발행된 리포트는 재생성·재발송 없이 정제하는 관리자 POST /api/admin/reports/:weekId/sanitize · backend src/reports/{weekly_pipeline,router}.ts
- 2026-07-24 · 인쇄 여백 개선(좌우 padding 18mm=여백설정 무관, 상하 @page 15mm+padding 10mm) + 뉴스 기사 상세에 'PDF로 저장' 버튼(기사 듣기 옆, breadcrumb·관련뉴스 no-print) · web src/app/globals.css, src/app/news/[id]/article-client.tsx
- 2026-07-24 · 인쇄 시 기사 제목/메타 유지(main header는 표시, 사이트바만 숨김) + 기사 인용부호("…") 텍스트 accent 색 강조(segmentQuotes, 화면·PDF) · web src/app/globals.css, news/[id]/article-client.tsx, lib/quote-highlight.ts
- 2026-07-25 · v1 온톨로지+군수 계보 KG(kg_nodes/edges/ontology, /api/admin/kg) · backend/src/kg/*
- 2026-07-25 · KG 인물 추출·공동등장 그래프(kg_mentions/coappears, tools/kg/*, verified=0 미주입) · db/034
- 2026-07-25 · 기사 인물 관계도 UI(관리자 베타, /api/admin/kg/article·person/ego, 자체 캔버스) · web/src/components/kg-graph.tsx
- 2026-07-26 · 동명이인 병합 검수 콘솔(soft canonical_id, /api/admin/kg/merge*, tools/kg/merge-candidates) · web/admin/kg 검수탭
- 2026-07-27 · 관계 라벨링(weight≥10 coappears에 reltype, Gemini, tools/kg/label-relations) · graph.ts·kg-graph 엣지 라벨

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

- 2026-07-04 · 뉴스 최신순 확정(idxno DESC tiebreak): 같은 시각(07-03T16:00 등) 기사 동순위 정렬이 뒤죽박죽이라 /news 표시순과 오디오 생성순이 어긋남→맨위 기사에 Chirp3 폴백이 뜸. /news 목록·최종병합·gen-news-audio 정렬 모두 published_at DESC, idxno DESC로 통일. 맨위=Gemini 일치

- 2026-07-05 · 주간 리포트 크론 16:00→18:00 KST 변경(0 7→0 9 UTC 금). W27은 최신 기사까지 반영해 수동 재생성·발행(푸시 재발송 없음, manual-refresh)

- 2026-07-05 · 주간 개인화 푸시 09:00→19:00 KST 변경(0 0→0 10 UTC 금). 리포트 발행(18시) 1시간 뒤 발송

- 2026-07-05 · 저녁 뉴스 브리핑 Gemini 멀티스피커화(NotebookLM급): tools/podcast/gen-briefing.mjs(최근14일 주요기사5→2인대담→멀티스피커 WAV, audio/briefing/<날짜>-gem.wav). Worker /briefing이 gem.wav 우선 서빙(구 Llama+Chirp3 폴백). VPS 타이머 매일 17:00(taean-briefing). 무료 키(.gemini_keys 공유)

- 2026-07-05 · 저녁 브리핑 소스 확장+3분 제한: 군정공지·태안신문·네이버외부보도 3갈래 종합(오늘 우선, 최근 3일 보강). 3분 이내(22~26줄·950자 지시). gen-briefing.mjs

- 2026-07-06 · 저녁 브리핑 신선도/정확성 감사 수정(멀티에이전트 검증 8건): (1)브리핑 캐시헤더 21600→600+must-revalidate(날짜없는 고정URL의 6시간 캐시가 어제 것 재생시킴) (2)Worker 폴백 covered.json dedup+신선분 없으면 404(반복 방지) (3)폴백 소스쿼리 개별실패 격리(allSettled) (4)gen-briefing 후보 LIMIT 30으로 dedup-before-LIMIT 해소 (5)covered.json 로드 오류를 최초실행과 구분(조용한 dedup 비활성 방지) (6)FORCE 재실행 자기오염 방지 (7)covered 저장실패 로그 (8)팟캐스트 force=1 관리자 무효화. -pod.mp3→-mono.mp3(단일진행자 자연낭독)

- 2026-07-06 · 저녁 브리핑 마지막 멘트 고정: "OOOO년 O월 O일 저녁 태안 소식이었습니다"(KST 날짜 프로그램 계산·마지막 줄 append). VPS Gemini(dialogue.push)·Worker 폴백(synthBriefingMono closing 인자) 양쪽. LLM엔 날짜 직접 말하지 말라 지시

- 2026-07-06 · 리디자인 감사 TIER1 적용(안전): 404/error 페이지·news·archive loading 대신 메타데이터 layout, 버튼 active:scale, eyebrow 대비개선(accent.ink #7A5C0A), 포커스링 네이비, 고대비 토글 실버그 수정(body 스코프), text-wrap balance/pretty+히어로 br제거, 종이 grain 오버레이(2.2
- 2026-07-06 · 리디자인 감사 TIER1(안전): 404/error 페이지, news/archive 메타데이터 layout, 버튼 active:scale, eyebrow 대비(accent.ink #7A5C0A), 포커스링 네이비, 고대비 토글 실버그 수정, text-wrap balance/pretty, 종이 grain 오버레이(z-1), min-h-dvh. 폰트 자체호스팅(#1)·아이콘·색대비는 사용자 결정/육안검증 대기

- 2026-07-06 · 브랜드 액센트 황토→갯벌 페트롤(#116E7A, AI 크림+테라코타 클러스터 탈피): accent DEFAULT #116E7A / subtle #CFE3E6 / ink #0E5860, ::selection, OG카드 #c9a227→#4FB3BD(네이비 위 가시). 토큰화돼 있어 전 사이트 즉시 반영

- 2026-07-06 · 폰트 자체호스팅 + 쿨 배경(리디자인): Pretendard Variable(next/font/local, woff2 2MB 번들, 전 방문자 전달) + Fraunces(next/font/google, 라틴 숫자·라벨 세리프). 배경 크림 #FAF9F6→쿨페이퍼 #F5F7F7(페트롤 조화·AI클러스터 탈피). tailwind sans/display를 CSS변수로

- 2026-07-06 · 이모지 아이콘→통일 라인 아이콘(Phosphor, 리디자인 TIER3): components/icon.tsx 래퍼(43개 시맨틱명→Phosphor, currentColor·1.1em). 26파일 71개 기능 이모지 교체(병렬 워크플로+타입검증). 날씨·해양·관광 데이터 글리프·화살표·상태(✅⚠)는 유지
- 2026-07-07 · 아카이브 검색결과 총 건수·전체 페이지수 표시: search API가 항목쿼리와 병렬 COUNT로 total·totalPages 반환(FTS/LIKE/목록 3모드). 상단 "검색 결과 N건 · p/전체페이지", 페이저 "p / 전체" 표시
- 2026-07-11 · 태안군TV 영상(서버 미저장): /api/news/tv가 태안군 공식 유튜브(@taeangun, tv.taean.go.kr 뉴스태안 동일) RSS 패스스루(엣지캐시 15분, D1 미사용). /news "📺 태안군TV" 탭(클릭 시 인라인 유튜브 재생) + /live 극장형(큰 플레이어+좌우 스크롤 스트립)
- 2026-07-12 · 전자북 기사 수정 요청: 회원이 본문 드래그→수정 요청(/api/archive/corrections, D1 article_corrections), 관리자 /admin ✏️수정요청 탭에서 확인·치환·본문교정 후 승인/반려, 내 페이지 "내 수정 요청" 현황. FTS UPDATE 트리거(030) 추가로 본문 수정 검색 반영
- 2026-07-13 · 주간리포트 발행 자기복구: 자정 크론 catchUpWeeklyReport(발행 예정 지난 최근 주 미발행 시 재시도, 금~일은 초안 생성부터) + 금요 크론 생성/발행 try 분리(W28 미발행 장애 재발 방지) · backend/reports/scheduled.ts, index.ts
- 2026-07-13 · 실거래가 RTMS 일시오류 재시도: metrics 동시 팬아웃 시 순간제한에 걸린 응답이 빈결과로 삼켜져 최근달 누락되던 것 → resultCode 검사+지수백오프 3회 · backend/env/realestate.ts
- 2026-07-14 · TTS 낭독 특수문자 정규화 보강: 태안신문 ▲불릿을 '삼각형'이라 읽던 문제 등(대괄호·중괄호·따옴표·단위·@·백슬래시) 4경로(Chirp normalizeForTts, gen-news-audio·gen-podcast·gen-briefing) 동일 규칙 적용. 캐시무효화 뉴스 -hd5·-gem2 · backend/src/audio/router.ts, tools/{news-audio,podcast}
- 2026-07-16 · 홈·라이브 '탈 AI스러움' 에디토리얼 정리(시스템 색·타이포 불변): 홈 카피에서 'AI' 남발 제거(가치어로)·서비스 4카드+01–04넘버 → 괘선 인덱스·그라데이션 블러 오브 삭제·내부용어(HITL·PRD) 사용자언어화, /live 섹션 이모지 마커 9개 제거(accent-rule로 위계) · web/components/home/generic-home.tsx, web/app/live/page.tsx
- 2026-07-16 · 브랜드명 '태안 AI 인텔리전스' → '태안 인사이트'(도메인 taean-insight 일치, 로고는 TAEAN INSIGHT 영문+국문 락업): 헤더·푸터·메타 title/template/siteName·OG 9곳 일괄 · web/components/site-header·footer, layout.tsx, live/reports/news OG
- 2026-07-16 · /query·/reports 카피 탈AI스러움(신뢰 라벨은 유지): 나브 'AI 질의'→'질의응답', h1 'AI Query Agent'→'무엇이든 물어보세요', 'AI 답변'→'답변', 내부용어 '(RAG)'·'(HITL)'·'캐싱 우선' 제거, '이번 주 AI 팟캐스트'→'이번 주 팟캐스트'. AI 생성/보조/작성 표기는 거버넌스 요건이라 존치 · web/app/query, web/components/reports, site-header
- 2026-07-18 · AI 질의 하이브리드 검색: 키워드 FTS + Vectorize 의미검색(bge-m3 1024d) RRF 병합, cosine 유사도 하한 0.5. 본문충실 아카이브 ~59k 임베딩 백필. Vectorize/AI 실패 시 키워드 폴백(회귀 0) · backend/src/query/{router,rrf}, lib/embed, reading/embed-backfill
- 2026-07-18 · 뉴스 나래이션 무료 키 3키 로테이션(45건/일) + R2 오디오 manifest 관리 엔드포인트 + 저품질 고아 오디오 123개 정리 + 역순 백필(남는 용량으로 과거 최신순) · tools/news-audio, backend/audio/manifest
- 2026-07-21 · 지역언론 수집(태안 필터): 충남일보·디트뉴스24·충청투데이 RSS를 12h cron으로 수집→'태안' 필터→regional_news(url dedup). 질의 시 키워드 매칭 상위 3건 근거 주입(원문 링크·요약, 저작권). '올해/최근' 질문에 현재 데이터 공급 · backend/news/regional, query/router, db/031
- 2026-07-22 · 질의 fact table(큐레이션 검증사실): facts 테이블+matchFacts 키워드 매칭 주입(확인된 사실 우선)+관리자 upsert(/api/query/_fact). 열거·전수형 질문(섬 명단 등) 보완. 첫 사실 '태안 섬 현황'(114개 공식) seed. 재시도 순차→병렬로 지연 45→10초 · backend/query/facts, db/032
- 2026-07-27 · 인물 탐색(취재 지원): /admin/kg 탭, 검색→관계망·함께등장·기사·직위·시기추이, 바이라인 5000건 제외 · backend/src/kg/people.ts·web people-explorer.tsx
- 2026-07-27 · 오디오 Chirp3-HD 폴백 제거: news/briefing/podcast는 Gemini 낭독(.wav)만 서빙, 없으면 503(no_audio)→프런트 '음성 준비 중' 안내. 한도소진 status.json(missing/exhausted) 기록. Chirp 폴백본 R2 15건 삭제 · backend/audio/router, web {news,briefing,podcast}-audio, tools/news-audio/gen-news-audio
- 2026-07-27 · 오디오 WAV→MP3 전환(용량 ~1/10): gen 3종이 ffmpeg 128k mp3 생성(-gem2.mp3/-gem.mp3), Worker mp3우선+wav폴백, manifest 분류 mp3 인식. 기존 WAV 트랜스코딩+구본삭제(transcode-wav-to-mp3.mjs). VPS에도 ffmpeg 필요 · backend/audio/{router,manifest}, tools/lib/wav-to-mp3, tools/{news-audio,podcast}
- 2026-07-27 · 오디오 Range 요청 지원(<audio> 스트리밍·seek 필수): serveAudio 헬퍼가 Range 시 206 부분응답(content-range·content-length·accept-ranges), 없으면 전체+content-length. news/briefing/podcast 공통 적용. 기존 200 chunked(content-length 없음)로 audio play()가 stalled되던 문제 해결 · backend/audio/router
- 2026-07-28 · 오디오 재생 <audio>→Web Audio 전환(근본 해결): <audio> 요소가 이 환경(사용자 Chrome)서 원격 mp3를 로컬 blob으로도 로드 못 하고 stalled(Range·44.1kHz 재인코딩도 무효). decodeAudioData·fetch는 성공 확인 → fetch+decodeAudioData+AudioBufferSourceNode로 재생하는 공통 web-audio.tsx(재생/일시정지/진행바 커스텀)로 news/briefing/podcast 전부 위임 · web/components/{web-audio,news-audio,briefing-audio,reports/podcast-audio}
- 2026-07-28 · 관리자 로그인 쉽게: 토큰 저장 sessionStorage→localStorage(로그인 유지), 라벨 '토큰'→'비밀번호', 푸터 관리자 버튼 강조 · web admin/kg·admin·client·article-graph·site-footer
- 2026-07-28 · AI 답변 가독성: 문단·불릿·소제목·**굵게** 구조화(줄글 한덩어리 해소). LLM 프롬프트에 구조화 지시 + parseAnswer 줄단위 파싱(줄바꿈 있으면 문단/불릿/소제목, 없으면 기존 번호목록) + answer-view 렌더 · backend/query/router, web answer-format·answer-view
- 2026-07-29 · 인물 탐색 강화(기자 체감↑): ①AI 인물 브리핑(Workers AI 무료, 직위·관계·기사제목 요약 3~4문장, verified 아님·lazy 로드) ②함께등장 인물에 관계 성격 라벨(협력·대립·소속) ③피크 시기 표시. 부가: 검색 자동로드·시기막대·상단메뉴 지식그래프 · backend/kg/{people,admin_router}, web {people-explorer,api/kg}
- 2026-07-29 · KG 동명이인 명백건 자동병합: 병합 후보 중 '공백만 다른' 확실 동일인 13쌍만 soft 자동병합(대표=등장 많은쪽), 애매한 건 검수 유지 · tools/kg/auto-merge-obvious.mjs
- 2026-07-29 · AI 인물 브리핑을 공개 질의(/query)에 첨부(A2): 질의에 등장 많은 KG 인물명 감지 시(바이라인·저빈도 제외) 답변과 병렬로 brief 생성→personBrief 반환, '검증 아님' 카드 노출 · backend/kg/people(detectPersonInQuery)·query/router, web query-client·api/query
- 2026-07-29 · 인물 대표 사안 키워드(B4): 프로필에 topics 추가 — 기사 제목 최대 300건에서 자주 나오는 키워드(제목 문서빈도>=2, 본인이름·지역명 제외)를 칩으로. 순수함수 topTopics+테스트 · backend/kg/people, web people-explorer
- 2026-07-29 · 관리자 메뉴 앵커 절대경로화(D7): 헤더 섹션 링크 #앵커→/admin#앵커 (지식그래프 등 다른 관리자 페이지에서도 이동+스크롤) · web/components/admin-header
- 2026-07-29 · 관계 라벨링 --min-weight 파라미터화(C6): weight>=10 하드코딩→--min-weight(기본 10). w5-9 등 확장 라벨링 가능(GEMINI_API_KEY 사용자 터미널 배치, reltype IS NULL 자동 스킵) · tools/kg/label-relations
- 2026-07-29 · 검증된 인물 관계를 질의에 주입(B3, 검증-only): 관계형 질의(대립·협력·측근 등)+인물 감지 시 verified=1 coappears 관계만 근거블록으로. 자동추출은 공개답변에 단정 안 함(무동작), 검수 승격 시 자동 반영 · backend/kg/relations, query/router
- 2026-07-29 · 역대 군수 Fact 시드 템플릿(C5): office+인물+held를 verified=1로 upsert. LINEAGE 비워둠(운영자가 공식기록으로 채워 --confirm) → '역대 군수' 질의에 [확인된 사실] 반영. 인구추이는 data.go.kr 15108065 활용신청 대기 · tools/kg/seed-gunsu-lineage
- 2026-07-29 · 역대 군수 6~16대 반영(C5 실행): 아카이브 근거로 김경년~윤희신 확정, person:<이름> 노드 연결, held id에 대수 포함(재선). '역대 군수' 질의가 1~16대 답변(1~5대는 아카이브 명단 보강) · seed 실행
- 2026-07-29 · 관계 검증 토글(B3 활성화 도구): 인물 탐색 coappear에 엣지 id·verified·relreason 실어 ✓검증/취소 버튼(verified=1 승격→B3 반영). 파이프라인 완성: 추출→라벨→검수→답변 · backend/kg/people, web people-explorer
- 2026-07-29 · 관계 라벨 수정(relabel) + 일괄 검토: 인물 탐색 coappear에 라벨 드롭다운(틀린 관계종류 교정 후 검증), /admin/kg '관계 검수' 탭(라벨된 관계 weight순 훑어 수정+검증). backend relations.ts listPendingRelations/setRelation/isReltype + admin_router 2엔드포인트 · web relations-review·people-explorer
- 2026-07-29 · AI 답변 교열+정리(읽기 좋게·오타 다듬기): 생성답을 무료 AI로 1회 교열(빠진 글자·조사 복원)→tidyAnswer 결정론 정리(말미 중복 출처꼬리 제거·인라인 굵게불릿→줄바꿈 불릿·한덩어리→문단분리). 출처는 원문 [번호] 기준 계산(교열 무관). 답 캐시 안 함 · backend/query/answer_quality(polishAnswer·tidyAnswer)·router
- 2026-07-30 · 답변 지연 단축(LLM 왕복 5→1~2회): ?debug=1 구간타이밍으로 LLM 생성이 병목임을 확정. ①붕괴방지 병렬3회→'조기종료 순차'(정상이면 1회) ②교열패스 핫패스 제거(답 생성 뒤 통째 재생성=지연2배, 구조는 본답 프롬프트+tidyAnswer로 유지) ③재시도 판정 분리 isSalad(반복·저한글·영어융합만 재생성) vs 외국문자누수(제거로 충분). 실측: 아카이브 질의 ~70→12~19초. 웹종합은 fp8 실제 salad로 2회 잔존(~53초) · backend/query/answer_quality·router
- 2026-07-30 · 답변 스트리밍(체감 지연↓) + 근거 단락화 + PDF 저장: /api/query?stream=1 SSE로 토큰 흘려보내 첫 글자 ~6초에 표시(완성 대기 없앰), done 이벤트에 정리본·출처·근거. 근거를 paragraphize로 문단 카드(펼침 기본), 'PDF로 저장' 버튼=근거 펼치고 window.print(전역 워터마크·페이지여백 재사용). 백엔드 stream.ts(drainSse)·sources.ts(selectSources 공유)·WorkersAiLlmClient.stream · backend/query/{router,stream,sources}, web query-client·api/query·paragraphize
- 2026-07-30 · 근거 대조 교열(숫자 복원) — 스트리밍 화면 답 + PDF 공통: fp8 단일패스라 연도 숫자를 가끔 흘림('개발은년부터'). 완료(done) 직후 POST /api/query/polish {draft,evidence[]}로 [근거]와 대조해 빠진 숫자·글자 복원한 교열본으로 화면 답을 자동 교체('1997년부터'·'2012년' 복원 확인), PDF는 그 교열본을 인쇄. 근거에 없는 숫자는 지어내지 말라 지시, 실패 시 원본 유지. 읽기는 스트리밍(빠름)→몇 초 뒤 숫자까지 정확 · backend/query/router(polish), web query-client(refine·savePdf)·api/query(polishForPdf)
- 2026-07-30 · 태안군의회 역대 의원(1~10대) Fact 시드: council.taean.go.kr 역대의원(sess_id=대) 공개페이지 파싱→대별 명단을 facts 테이블에 시드(대별 10 + 개요 1). '역대 군의원'·'제N대 의원' 질의가 검증 출처로 답(추정 제거). 스크래퍼 tools/kg/seed-council.mjs, 시드 SQL council-facts.sql · (역대 군수 사진 공식본은 taean.go.kr WAF라 브라우저 우회 필요 — 후속)
- 2026-08-01 · 인물 탐색 공개 토글(superadmin 원클릭): app_settings(037) 런타임 플래그로 /people 노출을 배포 없이 즉시 on/off. off면 /api/kg 검색·프로필 disabled(데이터 유지)·페이지 '준비 중'·헤더 nav에서 숨김(status 30s 캐시). /api/admin/settings(superadmin만, 무권한 401 확인)·/api/kg/status. /admin/report 운영정보에 토글 UI. backend settings·admin/settings_router·kg/public_router, web app/people·site-header·admin/report
- 2026-08-01 · 독자용 공개 인물 탐색(/people) — 안전 v1: 지식그래프(KG 실용화 ③단계)를 독자에게 공개. 백엔드 공개 읽기전용 /api/kg(persons/search·person/:id/profile, people.ts 재사용·초허브/바이라인 제외). 프런트 /people 검색→프로필(관계망 KgGraph·함께등장·기사·시기별·직위verified). **'AI 자동추출·미검증' 크게 안내, 관계 라벨은 verified만 노출**('함께 등장 N회'는 관계 아님 명시). nav는 회원부터 노출(비로그인 4개 유지, 라우트는 공개 URL). 스모크: 가세로 함께등장12·기사30. 확대 옵션: 완전 공개 nav / 검수 관계만. backend kg/public_router, web app/people·lib/api/kg-public·nav
- 2026-08-01 · 인물 탐색 3차 마감 — 한자 정제 + 그래프 꽉 채우기(피드백 '한자 보임·그래프 작음'): **①한자 누출 제거.** Workers AI가 전기에 此外·他 등 한자를 섞던 것을 `stripHanja`(흔한 접속어 한국어 치환 후 잔여 CJK 한자 제거, 고유명사 전부 한글이라 안전)로 정제, buildPersonBrief 반환 전 적용 + 오염 캐시 비워 재생성(가세로 한자 0 검증, 단위테스트 4). **②그래프 박스 꽉 채우기.** 물리 레이아웃이 자연 좌표로 작게 수렴하던 것을, 사후 좌표 변형 대신 **표시 변환**(draw마다 computeFit이 노드 분포를 캔버스에 맞춰 sx·sy 확대, 축소 금지 sx,sy≥1→겹침 없음, 왜곡 1.7배 제한; PX/PY로 그리기·히트테스트 모두 스케일)으로 전환→타이밍·재압축 무관하게 항상 꽉 참. 높이 440→560. 가세로 검증: 김진권~신경철 전폭에 퍼진 mesh 네트워크. backend kg/people(stripHanja)+test, web kg-graph(표시변환)·people/page(height 560)
- 2026-08-01 · 인물 탐색 2차 개선 — AI 전기 + 진짜 관계망(피드백 '소개 부족·그래프 마음에 안듦'): **①인물 소개=기사 근거 AI 전기.** 쿼리 경로의 buildPersonBrief(Workers AI 무료·제목·본문 발췌 근거 5~7문장·지어내기 방지)를 공개 엔드포인트 `GET /api/kg/person/:id/brief`로 노출, `kg_person_bio`(mig 038)에 인물당 1회 영구 캐시(첫 호출 ~11s→캐시 0.8s). PersonIntro가 프로필 표시 후 지연 로드(shimmer)→전기 문단, 실패 시 결정론 한 줄 폴백 + 확정 팩트 스트립(등장수·활동연도·직위·동반)·주제칩(노이즈 불용어 필터). 검증: 이용희→'대한노인회 태안군지회장…게이트볼대회 개최…노인지도자 양성교육'(직위 지어내기 없음). **②관계망=별→네트워크.** personEgo가 중심연결 엣지만 반환하던 것을 유지노드 집합 내 이웃-이웃 coappears 2차 조회로 보강(중복합산 방지 위해 이웃끼리만, D1 100 바인딩 한도로 45명까지). 이용희 12엣지(순수 별)→78엣지(중심12+mesh66), 김기두·김영인 256 등 군집 노출. KgGraph 엣지 두께를 weight 8캡(전부 동일두께 버그)→그래프 최대값 대비 √정규화(강한 관계 굵게). backend kg/graph·public_router, web people/page·kg-graph·api/kg-public, db/038
- 2026-08-01 · 인물 탐색(/people) 소개+관계망 개선(피드백 '허접함' 대응): 검색된 인물 상단에 **인물 소개 카드**(직위·활동기간·아카이브 등장수·자주 함께 등장 3인·주요주제, 결정론 자동요약+'미검증' 고지). **관계망(kg-graph.tsx) 직관화** — 중심 인물 화면 중앙 고정·강조, 노드 반경 상한(mentions√ 캡=블롭 방지), 충돌 분리(원 겹침 방지), 관계 유형별 색(협력·동료=초록/전임·후임=보라/대립·갈등=빨강/소속·상하=파랑/가족·인척=주황)+색 범례. **관계 라벨은 검수된(verified=1) 관계만** 색·라벨로 노출(공개 안전 약속 유지, 나머지는 '함께 등장' 빈도만). 브라우저 검증(가세로: 태안군수14대 요약·협력/전임 색범례 렌더). 후속: 인물 소개 topTopics 불용어 정제(위한·한다 노이즈). web app/people/page.tsx·components/kg-graph.tsx
- 2026-08-01 · 투고 경로 서버 권한 강제 + 현직 의원 사진 + 보고서 확장: (보안) copilot·citizen/articles를 세션 citizen+ 강제(이전 무방비→무세션 401 확인), /citizen·/citizen/articles 프런트 게이트 citizen+ 정렬, SessionUser에 uid. 시민기자 반려 시 role=citizen→user 회수(멱등성). 현직 군의원 7명 사진 R2 council/NN.jpg→인물카드(kg/council_members.ts, buildPersonBriefCard가 군수∥의원 사진 첨부, 김영인·최성미 검증). 보고서 8→9탭(💰비용·성과=cost/roi 요약)·요약 엔드포인트 counts/config 확장. 후속: 회의록/조례 검색 연동, 독자용 인물/관계 공개 위젯. backend kg/council_members·citizen·copilot·auth/session_guard, web admin/report·citizen
- 2026-07-31 · 관리자 보고서 메뉴(/admin/report) — 운영 핸드북: AdminHeader에 📄 보고서 링크 + 세션 admin 게이트, 서브탭 확장 구조(TABS 배열에 항목 추가). ①프로젝트 개요(소개·스택·기능·현황) ②운영 정보(접속주소·서버구성 바인딩·시크릿 이름/용도만·설정값·내부상수·회원현황 라이브 getUsers 집계). 보안: 시크릿 값 절대 미표시. web/src/app/admin/report/page.tsx. 배포·라이브(초기 404는 신규 라우트 전파 지연)
- 2026-07-31 · 회원 등급 Plan 4 배포 — /write 통합 투고 에디터: 시민기자 에디터(copilot+거버넌스+검수큐)를 `components/write/copilot-editor.tsx`로 순수 이동→`/write`(RequireRole citizen+, deniedHint로 시민기자 신청 안내). `/citizen/write`·`/reporter/write`→`/write` 서버 리다이렉트(?id= 보존—/citizen/articles 수정링크 깨짐 방지). reporter 초안 핸드오프 흡수하되 진행중 초안 있으면 hasDraft 지역변수 가드로 스킵(human aiLabel 오염 방지). SDD 3태스크·최종리뷰(opus) 승인. 스모크: /write 200·구경로 307 리다이렉트. **★ 회원 등급 시스템(Plan 1~4) 완전 라이브.** 계획=docs/superpowers/plans/2026-07-31-write-unified-editor
- 2026-07-31 · 회원 등급 Plan 3 배포 — 시민기자 신청/승인 + 강등 보호: 원격 036(citizen_applications 신청 대기열) 적용 + 백엔드·프런트 재배포. `/me` 시민기자 신청→관리자 콘솔 대기열 승인/반려(승인 시 role=citizen 자동, 상위 등급 보존). `roles.ts canModifyUser`로 강등 보호(admin이 superadmin 변경 403, Plan1 이월 해소). backend `citizen/{applications,applications_router}`·`POST/GET /api/auth/citizen-apply`, web `me/citizen-apply`·admin 대기열·등급셀렉트 citizen. SDD·최종리뷰(opus) 승인. 스모크: 신규 엔드포인트 무인증 401·공개질의 200. 후속 minor: 반려 후 role 잔존 멱등성. 계획=docs/superpowers/plans/2026-07-31-member-management-citizen
- 2026-07-31 · 회원 등급·접근 계층 시스템 Plan 1+2 배포(백엔드+프런트): 5+1계층(비로그인/user/citizen/reporter/admin/superadmin). 백엔드 `auth/roles.ts`(순위·hasRole·canAssignRole)·`auth/session_guard.ts`(sessionUser=sessions JOIN users·adminGuard 세션 브리지·requireSessionRole)·`/api/admin/users` 임명권한(admin=citizen까지·reporter/admin은 superadmin). 프런트 `lib/roles·nav`(등급별 visibleNav)·site-header(비로그인 4개=홈/뉴스/실시간/멤버십)·`RequireRole` 가드(query·reports·me·citizen=user·reporter=reporter)·admin 콘솔 세션 게이트(토큰 비상용 접기)·세션 토큰 키 통일(taean-auth-token)·로그인 redirect 오픈리다이렉트 방어(CWE-601). SDD 서브에이전트 실행·최종리뷰(opus) 승인. 스모크: 공개질의 무회귀·무자격 admin 401. **부트스트랩 대기: chs9182@gmail.com /login 가입 후 UPDATE role='superadmin'.** 미배포 Plan 3(회원관리·시민기자 신청), Plan 4(/write 통합). 설계·계획=docs/superpowers/{specs/2026-07-31-membership-access-tiers-design, plans/2026-07-31-access-control-foundation·frontend-access-tiers}
- 2026-07-30 · 태안군의회 현직(제10대) 의원 프로필 Fact 시드(선거구·연락처·소속·직위·경력): council.taean.go.kr(m_cd=11 현역의원) 페이지 내 JS변수 mb_data(JSON)+img alt 직위 파싱→현직 7명(가선거구 3·나선거구 3·비례 1) 개별 fact + 개요 1건 시드. '○○ 의원 연락처'·'현직 의원 명단'·'가 선거구 의원' 질의가 검증 출처(태안군의회)로 답(의장 김영인·부의장 장영숙 포함, 공직자 공개 연락처만). buildFactsEvidence가 처리하므로 backend 코드 변경 0=시드 즉시 라이브. 스크래퍼 tools/kg/seed-council-current.mjs(balanced-bracket mb_data 추출·부의장 비탐욕 매칭), 시드 SQL council-current.sql · tools/kg
- 2026-07-30 · 역대 군수 공식본(명단·재임) Fact 시드 + 인물카드 공식 사진: taean.go.kr/mayor(WAF라 HTML은 브라우저, 정적 JPG는 curl 허용) 13대(대수)를 1~16대 명단·재임으로 파싱→facts 'mayor-official' 시드(관선 1~5대 포함, 아카이브에 없던 초기대 정확 커버). 인물사진 12장 curl→R2 mayor/NN.jpg 미러(/api/archive/photo 공개서빙), kg/mayors.ts(이름→사진·재임, 진태구 9~10·12대 1장 공유) 순수로직 TDD. buildPersonBriefCard가 감지인물이 역대군수면 photo 첨부→인물브리핑 카드에 '태안군청 공식' 사진 표시(AI요약과 시각 구분). 가세로·윤희신 종단 검증 · backend kg/mayors·query/router, web query-client·api/query, tools/kg/mayor-facts.sql
- 2026-07-30 · [그래프 Step3] 경량 그래프를 기본 경로로 승격: query-client가 항상 /api/query/graph(SSE) 사용 → 전 사용자에게 '진짜 노드 진행률'(가짜 시간추정 대체) + 완성본. 실패 시 기존 /api/query(비스트림)로 자동 폴백. 토글 제거. (그래프는 B로 근거 파리티 확보 상태). 라이브: '실시간' 태그+실제 pct 기본 표시 · web query-client
- 2026-07-30 · [그래프 B] 근거수집 공용 추출 완료(메인·그래프 드리프트 0): 메인 핸들러의 특수 분기(내가게·날씨/예보·부동산·관광·바다·군정·큐레이션사실·군수·관계·지역언론)를 build*Evidence 공용 헬퍼로 전부 추출, 메인·그래프가 같은 코드 사용. 그래프 노드도 헬퍼 재사용, 아카이브 게이트를 메인과 동일하게(!isPureWeather&&!recommend&&!hasMyShop). 각 분기 라이브 스모크로 회귀 검증. 남은 그래프 미편입: offRegion 안내부·인물브리핑(A2 카드). Step3(기본값 승격) 가능 상태 · backend/query/router(build*Evidence)
- 2026-07-30 · [시제품] 경량 그래프로 실시간 단계 진행: LangGraph 라이브러리 대신 프레임워크 없는 runGraph(graph_engine.ts, 노드·when분기·진행이벤트)로 /api/query/graph(SSE) 구현. understand→archive→realtime?→web?→compose→refine→finalize, 기존 함수 재사용(추가 LLM 비용 0). 프론트 '실시간 진행(그래프 시제품)' 토글 시 SearchProgress가 가짜 시간추정 대신 진짜 노드 pct 표시. 기존 /api/query와 나란히(opt-in). answerSystemPrompt 공용 추출 · backend/query/{graph_engine,router}, web query-client·search-progress·api/query
- 2026-07-30 · 답변 속 수치 자동 차트(월별·연도별·읍면별): LLM 없이 답변 텍스트를 결정론 파싱해 SVG 막대차트 렌더(즉시·무료·안정). N월→line, YYYY년→line, '**라벨**: 값' 3개↑→bar(읍/면이면 '읍·면별 비교'). 한국어 수(만·억) parseKNum, 오인 임계값·prose 숫자 제외. currentColor로 테마 대응, 수치 없으면 미표시. 본답 프롬프트에 '표·아스키차트 금지' 추가. (LLM 추출은 Workers AI 빈응답으로 불안정→결정론 채택). WorkersAiLlmClient가 비문자 response에도 안 터지게 방어 · web chart-extract·answer-chart·query-client, backend workers_ai·query/router
- 2026-07-30 · 현재 날짜 주입(과거를 미래처럼 예측하는 모순 제거): 모델이 오늘을 몰라 '2025년 방문객'을 미래처럼 '예측/가능성'으로 답하던 문제. 시스템 프롬프트 첫 문장에 KST 현재날짜(nowKst) 동적 주입 + '오늘 이전은 지난 일→예측 금지·근거 실제수치로 사실, 없으면 데이터 없음, 예측은 미래에만' 지시 · backend/query/router
- 2026-07-30 · 대기 UX: '답변 작성 중' 상태 바 + 태안신문 최신 소식 홍보: 완성본 대기(~24~53초)를 채움. SearchProgress에 진행률 %(경과시간 기반 추정: estimatePct 95*(1-e^(-t/10s)), 95%서 수렴해 가짜100% 방지)+결정형 바, 45%↑에서 헤더 '답변 작성 중…'+이유 안내. NewsPromo가 getNews 최신 4건(카테고리·제목·날짜, 새 탭)을 페이지 진입 시 preload해 로딩 중 노출 · web search-progress·news-promo·query-client, globals.css
- 2026-07-30 · [교체] 스트리밍 끄고 '완성본만 표시': 스트리밍+완료후 스왑은 답이 눈앞에서 통째 리라이트돼 산만·신뢰 저하(사용자 피드백). 대신 서버가 생성→근거 대조 교열까지 마친 정확본을 /api/query가 한 번에 반환(polishDraft 헬퍼 공유, llmCalls=2). 화면은 SearchProgress→완성본, 바뀜 없음. 트레이드오프: 첫 글자 대기↑(단순 ~24s·웹종합 ~53s), 대신 화면·PDF 처음부터 정확·리라이트 없음. 스트림 경로(/stream·askQueryStream·drainSse)는 미사용 보존 · backend/query/router(polishDraft), web query-client(비스트림)
- 2026-07-27 · 인쇄·PDF 저장 품질(기사/주간리포트 공통): 모든 페이지 상하 여백(thead/tfoot 반복 프레임 — '여백=없음'에서도 유지), 사선 타일 워터마크 '태안신문' 10개(position:fixed 페이지 반복, 텍스트라 '배경 그래픽' 무관), 하단 중앙 페이지번호 n/N(@page @bottom-center + counter(page)). 주의: thead/tfoot에 break-inside:auto 금지(반복 대신 분할됨) · web/app/layout.tsx·globals.css
