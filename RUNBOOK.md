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

- 2026-08-17 · 시민기자 사진 업로드 401 수정 + 낡은 '무인증' 주석 정리 — 코드에 남은 '무인증/확인 후 제거' 표시를 점검하다 **진짜 죽어 있던 기능**을 발견. copilot 라우터는 `use("*")` 세션 가드가 전 경로에 걸려 있는데 `copilotUploadImage()`만 `apiFetch`를 우회해 손으로 헤더를 만들며 **Authorization을 빠뜨려** 시민기자 사진 업로드가 **항상 401**이었다(주석에 '바이너리라 직접 fetch'라고만 적혀 있었고 인증은 잊음). `buildApiHeaders()` 재사용 + content-type만 바이너리로 덮어쓰도록 수정하고, 이유를 주석에 남김. **낡은 주석 2건도 정리**(둘 다 실제로는 인증이 있는데 반대로 적혀 오해를 부름): copilot의 'PoC: 무인증 … 운영 시 reporter 인증 추가' → 세션 가드가 담당함을 명시 / reporter의 '임시 실발송 검증(무인증) — 확인 후 제거' → 대상 엔드포인트가 이미 사라진 고아 주석 삭제(바로 아래 `/draft`는 기자 인증 있음). 검증: 무토큰 401 유지(차단 정상). 백엔드 493·웹 47 통과. **교훈**: 'PoC·임시·확인 후 제거' 주석은 반드시 실제 코드와 대조할 것 — 이번엔 주석이 위험을 과장한 쪽(실제론 안전)과 기능이 죽은 걸 감춘 쪽이 동시에 있었다.
- 2026-08-17 · 경미한 모순 3건 정리 — ①**죽은 필드 `allNormal` 제거**: 운항 0편일 때 `[].every()`가 true라 '배가 없는데 전편 정상'. 소비처 전수 확인 결과 **읽는 곳 0곳**이라 삭제(필요하면 sailings에서 계산). ②**해변 추정/실측 구분을 데이터로**: 근거 문구엔 '(추정)'이 있었으나 등급 배지는 실측과 동일하게 보였다 → `BeachScore.estimated` + 카드에 '추정' 태그. 현재 KHOA가 7곳을 다 커버해 전부 false지만, 한 곳이라도 빠지면 되살아나는 경로. ③**운항상태 이진 → 3상태**(`classifyStatus`): 이전엔 '결항 계열이 아니면 정상'이라 **모르는 문구를 전부 정상으로 단정**(결항인데 표기를 모르면 독자에게 거짓말). `disrupted`(붉게+기자알림) / `normal`(알려진 정상 어휘만) / `unknown`(회색+'?', **알림은 안 보냄** — 오탐이 신뢰를 더 깎으므로 보수성 유지). 캐시 키 v4→v5(구조 변경 시 키를 올리는 자체 규약 적용 — 안 올리면 옛 구조가 30분 서빙된다). 백엔드 493·웹 47 통과.
- 2026-08-17 · 여객선 호출 예산 모순 해소(자체 정밀분석) — 주석은 '갱신 1회당 1건·48건/일'이라 단언했으나 **오전엔 119건까지 쓸 수 있는 구조**였다. 원인 3중: ①이 API는 **운항이 실제 일어난 뒤에야 행을 만든다**(실측 07:48 0행 → 10:33 2행, 첫 배 08:30) ②`refreshFerryCache`가 `available`일 때만 캐시를 써서 **빈 결과 구간(00:00~08:30)은 캐시가 영원히 비고 매 요청이 API로 샘** ③빈 결과면 **전국 스캔 폴백 6페이지**까지 돌아 1회 갱신=7건 → 30분 크론 17틱 × 7 = 119건(개발계정 한도 100건 초과). **수정**: ①`beforeFirstDeparture` 게이트 — 첫 배 전엔 **호출 자체를 안 함**(화면은 시간표·다음 배·연락처 그대로라 독자 경험 동일) ②**빈 결과도 캐시 기록**(`available` 조건 제거 — 빈 결과도 오늘의 유효한 답) ③전국 스캔 **하루 1회 제한**(`scannedAt`) ④스캔 성공 시 **실제 취항선명 학습**(`shipFilter`)해 다음부터 1페이지 복귀 = 배가 바뀌어도 하루 안에 자가 복구. 결과 **하루 약 37건**(08:30 이후 31틱×1 + 스캔 최대 6건)으로 한도의 40% 미만. 캐시 키 v3→v4. 게이트 경계 테스트 3건 추가, 백엔드 492 통과. 검증: 배포 후 `shipFilter=해랑5호`·`scannedAt` 없음(스캔 미발생) 확인. **교훈**: '캐시하니 저렴하다'는 주석을 쓸 때는 **캐시가 안 써지는 경로(빈 결과·오류)**를 반드시 같이 따져야 한다.
- 2026-08-17 · **GSC 사이트맵 실제 제출 완료** — 08-11에 '제출했다'고 알고 있었으나 **Sitemaps 목록이 0행**이었다(다른 속성에 넣었거나 저장 실패). 즉 **10.4만 건 사이트맵을 구글이 한 번도 읽은 적이 없었고**, 그동안의 SEO 작업(사이트맵 확대·JSON-LD·기사 SSR·연도 브라우즈·중복주소 정리)이 전부 스위치가 꺼진 상태였다. 속성 `https://axtaeannews.co.kr/`(URL 접두어)에 **`sitemap-index.xml`** 제출 → 성공. ⚠️`sitemap.xml`은 404이므로 절대 제출 금지(OpenNext가 인덱스를 자동 생성하지 않아 커스텀 라우트로 제공 중). **제출 전 전수 점검**: 인덱스 200·자식 38개, 38개 전부 200·URL 존재·XML 정상 종료, 총 **104,123 URL**. 내역 검증 = 정적·연도허브 47 + 기사 104,076이고, 기사 수는 아카이브 104,045(08-13) + 31(08-14 신문, 3시간 수집 크론이 당일 반영)과 **정확히 일치** → 파이프라인 누락 없음 확인. **후속 관찰**: GSC Sitemaps에서 상태·'발견된 페이지' 수가 10만 대로 채워지는지(수 시간~수일), 색인 생성 리포트에서 실제 색인 수 추이. 오류가 뜨면 해당 연도 청크만 개별 확인.
- 2026-08-17 · 가의도 뱃길 검색·탐색 노출 — 점검에서 발견: `/beaches` 제목·설명에 **배편 언급 0**, 사이트 전체 **뱃길 내부 링크 0개**. '가의도 배시간'·'안흥항 여객선'은 실수요인데(아카이브 가의도 783건) 정확한 시간표·연락처를 갖고도 검색에 안 잡혔다 — **08-13 /beaches 자체에서 발견했던 것과 같은 패턴**(콘텐츠는 만들고 문패를 안 담). **제목은 일부러 그대로 뒀다** — 검색량이 큰 '해수욕장·물때·낙조'를 지키고, 뱃길은 description·og·h2·본문으로 신호를 준다. '가의도 배시간'은 경쟁이 거의 없는 롱테일이라 정확한 문구가 본문에 있으면 잡히고, 제목에 밀어넣으면 큰 키워드만 희석된다. h2를 검색 문구 그대로 바꿈('⛴ 가의도 뱃길' → '⛴ 가의도 배 시간표 — 안흥항 여객선'), PageHeader 설명·홈 해변 카드에도 추가(내부 링크 0→1, 5가지→6가지 정정). 검증: title 유지·description/h2/본문 노출·홈 링크 확인. 웹 47 통과. web beaches/page.tsx·home/generic-home.tsx.
- 2026-08-17 · 중복 주소 근본 해결(Cloudflare 설정) — 08-13 canonical로 완화만 해뒀던 http/www 중복을 **엣지 리다이렉트로 근본 정리**. **①SSL/TLS → Edge Certificates → `Always Use HTTPS` ON** ②**Rules → Redirect Rules → 템플릿 `Redirect from WWW to root`**(301 · **Preserve query string 체크 필수** — 안 하면 `?utm_source=`(전환 퍼널 추적)·`?page=`(페이지네이션)·검색어가 날아간다). 배포 시 'This rule may not apply to your traffic — DNS may not be proxying www' 경고가 뜨는데, www가 **Worker 커스텀 도메인**이라 Cloudflare가 프록시 여부를 못 알아본 것이므로 **`Ignore and deploy rule anyway`가 정답**. ⚠️`Create a new proxied DNS record`는 고르지 말 것 — 기존 Worker 커스텀 도메인 바인딩과 충돌해 잘 되던 www가 깨질 수 있다. **검증(라이브)**: 4가지 주소(http/https × www/apex)가 전부 `https://axtaeannews.co.kr`로 301 수렴, 경로·쿼리스트링 보존 확인(`?utm_source=report&page=3` 끝까지 유지), apex 200 회귀 없음. Worker가 Redirect Rule을 가로챌 것이란 우려는 기우였음(Redirect Rules가 Worker보다 먼저 실행). 코드 변경 없음 — 대시보드 설정만.
- 2026-08-15 · 가의도 뱃길 = 배편 안내로 확장(결항 알림 → 상시 서비스) — 지적받은 문제: 카드가 운항상태 API에만 의존해 **밤에 보면 '오늘 6편 모두 완료'만 남고, 이른 아침(available=false)에는 카드가 통째로 사라졌다**. 정작 섬에 가려는 사람의 질문('다음 배 언제')에 답을 못 함. **①정기 시간표 상시 제공**(태안군청 공식): 하계(4~9월) 안흥 출발 08:30·13:30·17:00 / 동계(10~3월) 08:30·13:30·16:30. ※군청 표의 '도착시간'은 API 실측 결과 **가의도에서 되돌아 나오는 출항시각**이었다(09:05·14:05·17:35가 전부 '가의도 → 안흥') → 방향별로 표기. 군청 표와 API 실측이 일치해 교차 검증됨. **②`nextDeparture()`**: 지금 기준 다음 안흥 출발, 막배 후면 '내일 첫 배'. **라우터에서 응답 시점 재계산** — 30분 캐시에 얼어붙으면 최대 30분 어긋난다. 카운트다운(N분 뒤)은 두지 않음(페이지가 ISR 캐시라 분 단위는 어긋남). **③`available=false`여도 null로 버리지 않는다** — 밤·결항·API 장애일 때가 시간표·연락처가 더 필요한 순간. 운항상태만 생략. **④카드 재구성**: 다음 배(가장 크게) → 정기 시간표(방향별) → 오늘 운항 현황 → 운항사 연락처(신한해운 041-934-8772, `tel:` 바로 통화). **경계 테스트 6건**: 새벽·배 사이·막배 후·출항 정각(놓친 배를 다음 배로 안내 안 함)·동계/하계 갈림(17:00에 동계는 끝, 하계는 아직). 검증: 07:48(오늘 운항 0편)에 '다음 배 오늘 08:30' 정상 노출 — 예전이라면 카드가 사라졌을 시점. 백엔드 489·웹 47 통과. backend env/{ferry,router}.ts·tests/ferry_schedule.test.ts, web lib/api/reports.ts·report-charts.tsx.
- 2026-08-14 · 여객선 결항 크론 워밍 검증 완료 — 30분 크론이 실제로 도는지 확인하려 `wrangler tail` 3회·D1 원격조회 1회 모두 실패(백그라운드에서 tail 연결 끊김 0바이트 / D1 권한 7403). **응답에 `updatedAt`을 추가**해 밖에서 관측 가능하게 만들고(독자에겐 '기준 시각' 표기로도 유용), 캐시가 신선한 상태에서 값이 20:40:52 → **21:31:01로 이동**하는 것을 확인 = 크론 워밍 동작 확정. 교훈: 관측 불가능한 동작은 관측 가능하게 만드는 편이 빠르다.
- 2026-08-14 · 여객선 결항 → 기자 취재 알림 트리거(5종째) — 안흥↔가의도는 태안 유일 여객선 항로라 **결항 = 섬 고립**(주민 생활·응급이송·관광객 발묶임)이고, 이건 그 자체로 지역뉴스거리 → 기존 취재 알림 인프라(gov·env·spike·keyword)에 **ferry** 추가. 기존 트리거 무변경(추가형). **`detectFerry()`**: 비정상 편만 알림, `refKey=ferry:날짜:시각:방향`으로 상태가 여러 번 바뀌어도 같은 편 1회만 발송(멱등). 다이제스트 라벨 '여객선 결항'. **크론**: 취재 알림과 같은 30분 크론 블록에서 여객선 캐시를 **선워밍**(해무 워밍과 같은 자리) — 알림이 신선한 상태를 보고, `/beaches` 콜드 페치도 사라진다. 취항선명 필터로 1회=1건이라 48건/일(개발계정 100건 한도의 절반). **판정 분리**: `isNormalStatus()`를 순수함수로 빼고 테스트 3건 추가 — 화면 강조와 결항 알림이 이 함수 하나에 걸려 있어 **오탐(가짜 결항 알림)·미탐(조용한 결항)** 양쪽을 고정. 실측 상태값은 완료·출항중·운항중뿐이고 **결항 계열은 아직 관측 못 했으므로**, 화이트리스트가 아닌 '이상 신호 블랙리스트'(결항|통제|중단|취소)로 두어 새 정상 상태값이 생겨도 오탐이 안 나게 했다. ※실제 결항 발생 시 상태값 문구를 확인해 정규식 보정 필요. 백엔드 483 테스트 통과(신규 3). backend reporter/alerts.ts·index.ts·env/ferry.ts·tests/ferry_status.test.ts.
- 2026-08-14 · 가의도 뱃길(여객선 운항상태) 라이브 + 섬 실시간정보 조사 결론 — **조사**: 태안은 섬 119개지만 여객선 항로는 **안흥(신진도)↔가의도 단 하나**(1일 3회·30분·8km, 태안군청). 섬 CCTV는 **없음 확정** — KHOA 해무 CCTV는 전국 9곳 전부 대형 무역항(대산항·목포·부산북항/신항서측·여수·울산·인천·평택당진·포항), 우리 도로 CCTV 51대는 전부 국도로 관문 3곳(신진대교서측·안면대교북단·곰섬삼거리)뿐. 결국 실수요는 "오늘 배 뜨나" 하나로 좁혀짐(아카이브 수요: 신진도 1,270·가의도 783·격렬비열도 508·여객선 293건). **구현**: 한국해양교통안전공단 여객선 운항상태 API(data.go.kr 15142304, 무료·개발계정 자동승인) 연동. **확정한 사실(재조사 방지)**: ①엔드포인트는 서비스 URL 뒤에 상세기능 경로가 한 번 더 붙는다 `.../ferry-route-info-v4/get-ferry-route-info-v4` — 빼면 `NO_OPENAPI_SERVICE_ERROR`(코드 12, 인증 문제 아님). ②규격은 data.go.kr **영문 페이지가 서버렌더**라 거기서 확보(국문은 JS라 못 읽음). ③응답 필드는 스네이크케이스(`psnshp_nm`·`sail_tm`·`lcns_seawy_nm`·`nvg_seawy_nm`·`nvg_stts_nm`·`nvg_stts_chg_dt`) — 문서엔 한글 항목명만 있어 실측 확인. ④항로/항구 필터 파라미터가 **없어** 운항일자로 전국(1일 5,122행)을 받아야 함 → **취항선명 `psnshpNm=해랑5호`** 서버측 필터로 6페이지→1페이지(배 바뀌면 전국 스캔 폴백). ⑤한 편(출항시각×방향)마다 상태변경 이력이 여러 행(34행) → 편별 최신 상태만 남겨 5편으로 정리. **호출 예산**: 개발계정 일 100건 → D1 캐시 30분+stale-while-revalidate로 갱신 1회당 1건(최악 48건/일). 캐시 키에 스키마 버전(v2) — v1에서 필드명을 잘못 읽어 빈 값이 30분간 서빙된 사고 방지. **화면**: `/beaches`에 '⛴ 가의도 뱃길' — 편별 시각·방향·상태, 결항·통제 시 붉은 강조+사유. '정방향'은 '안흥 → 가의도'로 풀어 표기. 검증: 08:30/09:05/13:30/14:05/17:00 5편·해랑5호 렌더. 백엔드 480·웹 47 통과. backend env/{ferry.ts,router.ts}, web lib/api/reports.ts·report-charts.tsx·beaches/page.tsx. **후속**: 결항 시 기자 취재 알림 트리거 연결(기상악화→섬 고립은 지역뉴스), 운영계정 전환 시 갱신주기 단축.
- 2026-08-14 · 신선도·해변 커버리지 — 발행 당일 노출 + 해변 2→7곳 + 순위 로직 정상화 — **①발행 당일 기사가 하루 종일 안 보이던 문제**: 태안신문은 주간지(목·금 오전 발행)인데 수집 크론이 12시간 주기(09·21 KST)라 08-14 09:14 발행을 09:00 수집이 14분 차로 놓쳐 21:00까지 미노출. 수집 전용 크론 `30 */3 * * *`(8회/일) 신설 → 최대 지연 12h→3h. 무거운 배치(임베딩·클리핑·지역언론·군청목록)는 12시간 크론에 그대로 둬 **비용 증가 없음**(수집은 신규 없으면 로그인1+목록2, 기존 기사는 D1 조회 후 스킵). **②/live '최신 태안뉴스'가 최신이 아니었음**: `fetchLatestReport→fetchWeeklyNews` 체인이라 '리포트가 다룬 주차'(최대 일주일 묵음)를 최신으로 표시 → `fetchLatestNews`(/api/news=RSS+목록 병합)로 교체, 아카이브 수집 전에도 당일분 노출(검증: /live에 08.14 기사 12건). 워터폴도 제거. **③해변 커버리지 2→7곳**: 원인은 numOfRows 상한이 아니라 **페이징 부재**였다(전국 totalCount=500인데 1페이지 300행만 받음). ※numOfRows를 2000으로 올리는 시도는 응답 자체가 깨져 **4곳→2곳으로 라이브 퇴행**했고 즉시 원복(교훈: 상한 300, 확장은 pageNo). pageNo 페이징(1페이지로 totalCount 확인→나머지 병렬, 왕복 2회) 도입 → 몽산포·연포·어은돌 추가. 20분 TTL 캐시로 비용 상각. 진단 `?debug=1`(totalCount·페이지·박스행·해변명) 추가. 위경도 박스도 남하(latMin 36.55→36.36, 안면도가 통째로 잘리던 것). **④소스 중복 병합**: KHOA가 꽃지·만리포까지 주면서 기상청 지점과 겹쳐 같은 해변이 두 번 나옴 → 이름 기준 병합(수온·파고=실측 부이 우선, 해수욕지수·기온·풍속·개장=KHOA). **⑤순위 로직 2건**: (a)해수욕지수가 없는 기상청 지점은 0점이라 이론상 최대 74점 → '최고'(78+) 도달 불가, 수온 28.5℃ 꽃지가 24℃ 학암포보다 낮은 3위였다. 주석엔 "없으면 수온·파고로 근사"라 적혀 있었으나 **근사 로직 자체가 없었음** → `estimateIndex()` 구현(실측 KHOA 등급에 맞춰 보정, '(추정)' 표기로 실측과 구분). (b)23.8℃가 화면엔 '24℃'(Math.round)인데 채점은 24℃ 미만 구간이라 표시/채점 불일치 → 반올림값으로 통일. **⑥등급 포화 해소**: ③ 이후 7곳이 전부 99~100/'최고'로 뭉개지고 22.6℃가 29℃보다 위로 올라옴. 원인은 지수에 이미 반영된 파고·수온의 **중복 가산**(+12/+12) → 미세구분용으로 축소(파고 +3/+1, 수온 +8/+5/+2)하고 **등급 라벨은 공식 해수욕지수를 그대로 채택**(점수 임계 폴백은 지수 없을 때만), 파고 위험 시 강등 유지, 동점은 따뜻한 물 우선. 결과 83~96 분포·최고 4곳/좋음 3곳. 백엔드 480 테스트 통과(신규 3). backend wrangler.jsonc·index.ts·region.ts·tour/{marine,beach_board}.ts·env/router.ts, web lib/api/reports.ts·live/page.tsx.
- 2026-08-13 · 색인 조건 전수 점검 + 중복 주소(canonical) 해소 — GSC 열람 전에 **바깥에서 확인 가능한 크롤 조건**을 전부 점검. **정상 확인**: ①robots.txt의 `Disallow: /` 10줄은 전부 AI 학습봇(GPTBot·CCBot·ClaudeBot·Google-Extended·Bytespider 등 Cloudflare 자동 주입)이고 **Googlebot은 허용** ②Googlebot/모바일Googlebot UA 실접근 시 홈·해변·기사·사이트맵·robots 모두 200·**챌린지 0건**(Cloudflare Bot Fight Mode 사고 아님) ③사이트맵 38청크 전부 200+lastmod(샘플 10개=25,486 URL·~1.5s) ④대표 7페이지 `index, follow`(noindex 사고 없음) ⑤기사 응답 0.6~3.0s ⑥HSTS 2년 설정. **발견·조치**: `www.axtaeannews.co.kr`와 `http://`(80)이 **리다이렉트 없이 동일 내용 200** = 중복 주소 3벌. 기사는 `alternates.canonical` 덕에 이미 안전했으나 **홈·해변·지역경제·실시간·연도허브 등 나머지 전 페이지엔 canonical 부재** → 루트 layout에 `alternates: { canonical: "./" }` 추가(metadataBase=apex 기준 경로별 해석). 검증: 7개 경로 + **www 접근 시에도 apex canonical** 확인. **미해결(사용자 몫)**: ⓐGSC 제출 주소가 `/sitemap-index.xml`인지 확인 — **`/sitemap.xml`은 404**(OpenNext가 인덱스 자동생성 안 함, robots 38줄 열거로 우회 중) ⓑCloudflare `Always Use HTTPS` ON ⓒ(선택) www→apex 301 Redirect Rule. web layout.tsx. ※색인 수 자체는 GSC에서만 확인 가능(브라우저 확장 미연결로 이번엔 열람 못 함).
- 2026-08-13 · IA 후속: /beaches 검색 노출 복구 + 홈 진입로 정정 — IA 이동 후 점검에서 구멍 2개 발견·수정. **①/beaches가 검색에 사실상 없었음**: `metadata` export가 아예 없어 `<title>`이 사이트 기본값("태안 인사이트 | 태안신문")이었고 **sitemap STATIC 배열에도 누락** → 구글 미발견. 낙조·해무까지 모은 바다 허브인데 문패가 없던 셈. 키워드 제목("태안 해수욕장·물때·낙조")·설명·OG 추가 + 사이트맵 등록('태안 해수욕장 수온'·'안면도 낙조 시간'·'태안 물때' 롱테일 겨냥). **②홈이 이사 간 콘텐츠를 옛 위치로 안내**: 피처카드가 /live에 "낙조·해무·수산 경락가"를 약속했으나 각각 /beaches·/data로 이관 → 클릭해도 없음. 게다가 신설 메뉴 2개(해변·지역경제)는 홈에 진입로 자체가 없었음. **4카드 → 상단 메뉴와 1:1인 6카드**(sm 2열·lg 3열)로 재편: 지금 태안(날씨·대기질·산불·수요·CCTV) / 해변(적합도·물때·낚시·낙조·해무 5가지) / 지역경제(실거래·위판·물가·유가 + 공개 출처 26종). **숫자는 라이브 API로 실측 확인 후 기재**(출처 26종·바다 5가지). 신뢰 섹션 링크 '데이터 지도'→'지역경제·데이터 출처'. 검증: /beaches title 기본값 탈출·사이트맵 10개 정적 경로에 /beaches 포함·홈 6카드 SSR·옛 문구 0건. 웹 47·백엔드 477 테스트 통과. web beaches/page.tsx·sitemap.ts·home/generic-home.tsx. **후속**: GSC 색인 현황 점검(사이트맵 10.4만 제출분이 실제로 도는지), 관리자 보고서 3곳 '공개 데이터 지도' 표기 정리.
- 2026-08-13 · IA 정리: 콘텐츠 헤쳐모여(바다→해변 / 지역경제 신설·데이터지도 결합) — 겹치던 메뉴를 성격별로 재배치. **①/beaches = 바다 종합 허브**: /live에 있던 낙조·해무·시정을 이관(해수욕·갯벌·낚시와 한곳). **②/live = 실시간 현황만**: 바다·지역경제 섹션 제거로 페치 축소·가벼워짐(agri·seafood·auction·seasonal·farm·aqua 6개 fetch 제거). **③지역경제 신설**: /live 맨 아래 묻혀있던 지역경제(부동산·수산 시세·위판·물가·유가·산업구조)를 전면화해 **/data를 재구성** — 상단 '태안 지역경제'(실측 지표) + 하단 '우리가 쓰는 데이터 출처'(구 데이터지도, 카탈로그로 재프레이밍). 네비에 '지역경제' 추가(비로그인 노출). 검증: /data에 지역경제 지표+출처 카탈로그 SSR, 네비 지역경제→/data, /live 지역경제 제거(ISR 갱신 후). 타입체크·nav 테스트 통과. web nav.ts·data/page.tsx·live/page.tsx·beaches/page.tsx. ※/live는 ISR(180s)라 갱신 전까진 옛 화면 캐시.
- 2026-08-12 · 무료/유료 전략: 리포트 심화 섹션 소프트 게이트 — "무료 가입자에 과다노출" 우려 검토 → 전략 확정(**아카이브·기사=무료(SEO·공익), 미래지향 AI 판단정보=유료**). 실결제 전이라 하드 대신 **소프트 게이트**(미리보기+업셀→/membership 리드=수요검증). 첫 적용: 주간 리포트의 **프리미엄 섹션(부동산·지역경제, 관광·기상 전망)만 220자 미리보기+"이어 보기(멤버십)"**, 요약·환경(미세먼지 건강)·이벤트는 무료 전문. 게이팅 인프라(gate()·locked/truncated 렌더·블러 UI)는 이미 있었고 premiumOnly=false라 꺼져 있던 것 → gate()를 **섹션 선택형(PREMIUM_SECTIONS)·상시**로, 업셀 CTA를 /me→/membership?utm_source=report로(퍼널 출처측정 연결). 검증: /api/reports/latest 익명 응답에 tourism_weather·realestate만 truncated. ReportReader가 마운트 후 게이트본 재fetch라 브라우저 렌더. 477 테스트 통과. backend reports/router.ts, web reports/report-reader.tsx. **후속(소프트게이트)**: /live 예측 심화·오디오. 실결제(Toss) 붙으면 서버 withhold로 하드 전환.
- 2026-08-12 · 감사 P2/개선 3건(이미지 alt·글자스케일·연도 브라우즈) — **①콘텐츠 이미지 alt**: 기사 리드(캡션/제목)·본문·뉴스 썸네일에 의미있는 alt(구글 이미지검색+접근성). lazy·고정크기·CLS는 이미 처리돼 있었고 원본 리사이즈만 인프라(Cloudflare Images) 필요 → 후속. **②글자크기 컨트롤 실효화**: `--font-size-base`가 html 루트에 적용돼 rem 텍스트는 이미 스케일됐으나 **px 고정 텍스트 123곳**(text-[10px]/[11px])이 가++에도 무반응 → 전부 text-[0.625rem]/[0.6875rem]로 치환(기본 16px서 동일, 이제 반응). **③크롤 가능한 연도 브라우즈**: /news(302줄 클라)는 크롤 경로가 없어, 자립 서버렌더 `/archive/[year]` 신설(그 해 기사 20/page를 `<a href=/news/id>`로 + 페이지네이션·연도 이동 링크) + 사이트맵 id=0에 37개 연도 허브 추가 → 온사이트 내부링크로 아카이브 크롤 깊이 보완. 검증: /archive/2007에 20 기사링크+실제 제목 SSR, 사이트맵 37 허브. web archive/[year]/page.tsx·sitemap.ts·news/[id]/article-client·news/page·(px→rem 30파일). 타입체크 통과.
- 2026-08-11 · 감사 P1: 기사 제목·발췌 SSR화(색인 품질) — 기사 본문이 클라이언트에서만 fetch돼 초기 HTML엔 "불러오는 중…"뿐이던 것(구글 색인=제목+메타만) 수정. 서버 `page.tsx`가 아카이브 기사를 받아 **initialArticle prop**으로 전달 → ArticleClient 첫 렌더(SSR)에 제목·발췌·섹션 담김 + **이중 fetch 제거**. 공유 매핑 `reader.ts`(DOM 미사용, 서버 안전) 신설. 회원 게이트는 유지(익명=SSR 발췌+게이트, 회원=하이드레이션 후 전문 = 비클로킹). 검증: /news/8403 초기 HTML에 H1·발췌·"정책·행정", "불러오는 중" 0. web news/[id]/{reader.ts,page.tsx,article-client.tsx}. **P1 잔여**: 크롤 가능한 /news 브라우즈 URL(중간 가치 — 사이트맵이 이미 전 기사 발견 제공, 302줄 인터랙티브 재작성 필요라 보류). 홈은 이미 SSR 양호.
- 2026-08-11 · 감사 P0 퀵윈 6건(SEO 버그·성능·고령 접근성) — UX·성능·SEO 3중 감사 후 즉시 개선. **①기사 섹션 오분류 수정**: `/api/news/:id`가 아카이브 category를 무조건 "지역사회"로 하드코딩(10만 기사 JSON-LD/OG 섹션 오분류)→실제 category를 NEWS_CATEGORY_LABELS로 매핑(검증: industry→"수산·산업"). **②발행일 ISO8601 정규화**(toIso8601, 공백형→T+09:00, schema.org 유효). **③기사 메타 RSS 종속 제거**: `/:id`가 항상 라이브 RSS 먼저 호출→RSS 장애 시 아카이브도 502였음→D1 우선 조회, RSS는 폴백(아카이브 있으면 502 안 냄). **④/live 워터폴 제거**: fetchLatestReport() 단독 await 뒤 20개 fetch 시작하던 것→체이닝으로 전부 즉시 병렬(2.88s→1.77s). **⑤글자크기 컨트롤 접근성**: 가/가+/가++ 버튼 44px 터치타깃(min-h-11)+**모바일 상단바 상시 노출**(햄버거 속 숨김 제거, 고령 독자 발견성). **⑥멤버십 폼 라벨**: 사전신청 입력에 aria-label+autoComplete. 477 테스트 통과. backend news/router.ts, web live/page·site-header·membership/page. **P1 후속**: 기사 본문 SSR화·크롤 가능 아카이브 브라우즈 URL(SEO 회수 핵심). P2: 이미지 최적화·글자스케일 px텍스트·live 집계엔드포인트·캐시 CDN전파.
- 2026-08-11 · 아카이브 SEO 발견성 — 사이트맵 100건 → 전 기사 104,045건 + 구조화데이터 — 검색 유입 근본책. 이전 sitemap.ts는 **최신 100건만**(99.9% 미발견). **연도별 청킹**(idxno 불연속·전자북 9천만대라 OFFSET 5.7s→year 인덱스로 한해≤5.5k만 ~30ms): 백엔드 `GET /api/news/sitemap-years`(37연도)·`/sitemap-ids?year=`(id+발행일), 웹 sitemap.ts `generateSitemaps()`로 37청크+정적. **robots.txt에 전 38청크 URL 직접 나열**(OpenNext가 /sitemap.xml 인덱스 자동생성 안 함→인덱스 대신 열거). **JSON-LD NewsArticle**(제목·발행일·발행처 태안신문·이미지·섹션) 기사 서버컴포넌트에 주입 + `/api/news/:id`에 publishedAt 추가. 검증: robots 38 Sitemap·/sitemap/0.xml 정적·2007=2591·2026=1570·기사 HTML에 NewsArticle+datePublished. 477 테스트 통과. 후속: 기사 본문 SSR(구글은 JS렌더라 후순위)·내부링크·Search Console 등록. 유입을 리드로 전환하는 토대. 재사용 `MembershipNudge`(card-accent, source→utm_source) 신설 후 **질의 답변 하단(source=query)·뉴스 기사 하단(source=article)·/live 낙조·실시간 하단(source=live)**에 배치. 각 링크가 `/membership?utm_source=<지점>`이라 관리자 전환 퍼널 보고서(출처별 집계)가 **어느 무료 지점이 리드를 만드는지** 측정. 어떤 채널(카카오·지면QR·검색)로 들어와도 결국 무료 페이지 착지→넛지 전환. 검증: /live HTML에 넛지+링크 렌더 확인. web components/membership-nudge.tsx·query-client·article-client·live/page. 다음 유입 레버=카카오 채널·지면 QR(사용자 설정 필요). 결제자 분리(자녀 결제→부모 열람) 오퍼 신설. /membership에 4번째 카드("효도 구독(가족)" 월 9,900원·부모님 계정에 독자혜택+큰글씨·자녀결제·부고/행사 알림·선물하기), leadSchema enum에 "family" 추가(reader/family/business/org), 그리드 3열→4열. **참고**: 수요검증 깔때기는 이미 완비(오퍼 3종·리드캡처 /lead→subscription_leads·이벤트추적 membership_view/cta·관리자 전환퍼널 보고서 '📈 전환·구독' 탭·얼리버드 '첫 달 무료'·예보 적중률 신뢰요소·랜딩 히어로 CTA)였고, 리드 0건은 배관 문제 아님(테스트 리드 write 검증 통과)=신규 사이트 유입 부족. 실질 갭은 family 하나. 가격 9,900은 검증용 가설. web membership/page·api/membership, backend membership/router. 다음 레버=유입(지면 QR·카카오 채널)·수요 확인 후 Toss 실청구. W32 로고송 재믹싱본을 올렸는데도 화면이 옛 3:03을 재생 = **브라우저가 공용 URL `/api/audio/podcast`(max-age 24h)의 지난 파일을 캐시**(하드리로드로도 미디어캐시 잔존, 서버·엣지·SW는 정상 확인). **해결**: PodcastAudio가 `report.weekId`를 받아 **주차별 URL `/api/audio/podcast/<주차>`**(이미 있는 다시듣기 엔드포인트)로 요청 → 새 URL이라 캐시 우회 + **매주 자동 버전**(주차 바뀌면 URL도 바뀜). 검증: /api/audio/podcast/2026-W32 = 204초(로고송본). web components/reports/podcast-audio.tsx(weekId prop)·report-reader.tsx. ※사용자는 /reports 새로고침 1회로 반영.
- 2026-08-10 · 리포트 단일 섹션 재생성 엔드포인트 + W32 환경섹션 용어 정정 + VPS 최신화 — **①단일 섹션 재생성**: `POST /api/admin/reports/:weekId/regenerate-section {key}` — 발행본의 한 섹션만 최신 프롬프트·사실로 다시 생성해 교체(발행 상태·타 섹션·summary 보존). weekly_pipeline `genSection` 추출 + `regenerateSection`, router는 sanitize 패턴의 부분 UPDATE. 477 테스트 통과·배포. **②W32 환경섹션 정정**: 이미 발행된 32주차 본문의 'PM10/PM2.5'를 D1 부분갱신으로 '미세먼지/초미세먼지'(조사 과→와·이→가까지 정확)로 교체(원문 백업). ※엔드포인트는 프로덕션 ADMIN_TOKEN 필요라 이번엔 결정론 치환으로 처리, 엔드포인트는 향후 재생성용으로 배포. **③VPS 최신화**: `/opt/taean`을 `git pull`로 main 최신(5f90c07)까지 fast-forward → 팟캐스트 믹싱코드+로고송 자산+ffmpeg 모두 최신, 다음 주 로고송 자동 포함.
- 2026-08-10 · 주간 팟캐스트 로고송 누락 복구(W32) + 원인 = VPS 옛 코드 — /reports '이번 주 팟캐스트'에 로고송(인트로 징글)이 빠짐. **원인**: 팟캐스트 생성기(VPS 타이머 Fri 18:00 `tools/podcast/gen-podcast.mjs`)가 **커밋 ec30391(WAV→MP3)·8fefde3(인트로·아웃트로 믹싱) 이전 옛 코드**를 돌려 **원본 wav를 믹싱 없이** 업로드(W32는 `2026-W32-gem.wav`만·mp3 없음). 현재 커밋 코드는 mp3+믹싱이 정상. Worker는 `-gem.mp3` 우선, 없으면 `-gem.wav` 서빙(audio/router.ts). **W32 즉시 복구**: 로컬(자산 tools/podcast/assets/intro·outro.mp3 + ffmpeg)에서 기존 wav를 `mixIntroOutro`로 믹싱→`2026-W32-gem.mp3` 업로드(Gemini 재생성 없이 내용 보존, 3:03→3:24). **향후(중요)**: VPS에서 `git pull`로 최신 코드 반영 + ffmpeg(이번 세션에 설치) + 자산(git 추적) 확인해야 다음 주부터 자동 포함. 믹싱 폴백은 조용해서(⚠ 경고만) 눈치 못 챔 → 필요시 상태알림 보강.
- 2026-08-10 · 주간리포트 쉬운 용어 — 'PM10/PM2.5' → '미세먼지/초미세먼지' — 고령·일반 독자용으로 대기질 코드/영문약어 제거. 환경 섹션 프롬프트(weekly_pipeline.ts)·SYSTEM_PROMPT 규칙7('쉬운 용어' 하드룰)·사실 라벨(facts.ts recentEnv·liveConditions)을 미세먼지/초미세먼지로. 발행 리포트를 요약하는 팟캐스트 대본도 자동 반영. 규칙은 사용자 메모리에 '박제'(feedback_plain_terms_no_pm_codes). 477 테스트 통과. ※이미 발행된 32주차 본문은 옛 표기 저장 상태 → 표시까지 바꾸려면 해당 섹션 재생성 필요.
- 2026-08-10 · 관계도 '기타' 라벨 숨김 — 인물 관계망(기사 관계도·/people·관리자)에서 미분류 동시등장(reltype='기타')은 의미가 없어 **라벨 pill을 생략**(회색 관계선은 유지). 화면 잡음 감소, 의미 있는 관계(협력·동료·소속·상하·전임·후임·대립·가족)만 라벨 노출. web components/kg-graph.tsx 한 줄(라벨 루프 스킵 조건). 관리자 관계분류 어휘 RELTYPES의 '기타'는 유지(분류 선택지).
- 2026-08-10 · 인물 클릭 콜드 지연 근본 해결(브리핑 15초 → 캐시 0.37초) — 새 인물 첫 클릭이 "엄청 오래" 걸리던 원인=①AI 소개 콜드 생성 **~15초** ②프로필 콜드 ~2.3초. **①브리핑 백필**: 클릭될 인물(등장≥20건, **1,472명**) 소개를 배치 선생성해 kg_person_bio에 캐시(재개 가능·동시성5·재시도, 억제=바이라인/전국인물 스킵). 소개는 새 기사 유입 시에만 무효화되므로 한 번 만들면 유효. **②프로필 loadHubIds 5× 단축**: person마다 COUNT하던 상관 서브쿼리(296K행·115ms)를 `kg_mentions GROUP BY HAVING`(227K행·23ms)로 + 아이솔레이트 모듈캐시(5분)로 웜 요청은 D1 왕복 생략. backend kg/people.ts(loadHubIds). 477 테스트 통과. 후속: 일일 크론에 신규 임계돌파 인물 브리핑 선생성 추가하면 콜드 완전 제거.
- 2026-08-09 · 인물 브리핑 오프너 시제 강화 + 인물 프로필 엣지캐시(느림 개선) — **①오프너까지 '끝난 직책 현재형' 금지**: 최근 기사에 퇴임·이임·낙선·사퇴가 나오면 첫 문장도 '○○이다/○○다' 금지하고 '○○를 지낸·전(前) ○○·N년간 이끈' 역임형으로(전 수정은 본문만 과거형이라 오프너에서 '태안군수다'로 새는 모순 발생). 검증: 가세로 첫 문장 "가세로는 2018년부터 8년간 태안군수를 지낸 인물이다". **②/people 프로필 느림 개선**: 매 요청 D1 6쿼리+에고그래프로 ~1s → 응답에 **15분 엣지캐시(caches.default)** 추가(news/tv·reports 패턴 재사용) → 인기·재조회는 즉시(검증 3회차 0.25s). **③브리핑 스피너 해소**: 앞선 시제수정으로 비운 kg_person_bio 캐시를 등장 상위 50명 워밍 재생성(45 캐시·5 바이라인억제·0 실패). backend kg/people.ts(오프너 규칙)·kg/public_router.ts(프로필 엣지캐시).
- 2026-08-08 · 승격 축제 주관·개최지 자동연결 — 🎪축제 검수에서 축제를 verified=1로 승인(/verify kg_nodes)하면 **이름 근거로 관계 자동 추가**: 개최지(held_at, 이름에 박힌 장소 백사장·만리포·몽산포·꽃지·신두리·천리포·안면·코리아플라워)·관련 품목(relates, 대하·주꾸미·바지락·꽃게·마늘 등)·주관(hosts, '태안' 브랜드면 태안군청). **지어내기 방지: 이름에 명시된 것만**(해삼축제 등은 미연결). 같은 (src,rel,dst) 존재 시 스킵(시드 중복 방지). 예: 만리포주꾸미축제→개최지 만리포+관련 주꾸미, 태안국화축제→군청 주관. backend kg/festival_links.ts(inferFestivalLinks 순수+4테스트·autoConnectFestival)·admin_router /verify 훅(응답 linked 수). 477 테스트 통과. 승인 시 자동 발동.
- 2026-08-08 · /people 관계망에 조직 노드 표시 — 인물 ego 그래프에 **중심 인물의 검수된(verified=1) 소속 조직**을 노드로 추가(인물–기관 층 시각화). personEgo가 belongs_to verified=1 org(최대 5)를 kind:'org' 노드 + reltype:'소속' 엣지로 반환. 프런트 KgGraph: 조직 노드=사각형·🏢 라벨·시안색(#0891b2, 인물 원과 구분), '소속' 관계색, 조직 노드 클릭은 인물조회 미트리거(가드). GraphNode/KgGraphNode에 kind? 추가(하위호환). 검증: 가세로 공개프로필 graph에 org:taean-gov(태안군청) 노드+소속 엣지. backend kg/graph.ts, web components/kg-graph.tsx·lib/api/kg.ts. 473 테스트 통과.
- 2026-08-08 · 카카오 로그인 라이브(axtaeannews.co.kr) — 카카오 개발자앱 '태안인사이트'(ID 1537535) 생성·설정 완료 후 로그인 정상화. **필요했던 것**: ①Worker 시크릿 KAKAO_REST_KEY 설정(미설정이라 /start가 503이었음), ②콘솔 Redirect URI 등록(workers.dev 콜백)·카카오 로그인 활성화·동의항목(닉네임 필수), ③이메일(account_email)은 비즈앱 미전환이라 '권한 없음' → scope에서 제거(닉네임만, KOE009 방지), ④**카카오가 새 REST 키에 Client Secret을 기본 활성화** → 토큰요청에 client_secret 필수라 invalid_client(Bad client credentials) 발생 → KAKAO_CLIENT_SECRET 시크릿 추가 + 콜백 토큰요청에 client_secret 포함. 프런트 카카오 버튼은 NEXT_PUBLIC_KAKAO_ENABLED=1로 노출(.env.production). 이메일은 비즈앱 전환 후 scope·동의항목 복원 예정. backend auth/router.ts, web .env.production·login-client.
- 2026-08-09 · 인물 브리핑 시제 오류 재발 수정(지난 선거를 미래형으로) — /people 인물 소개(buildPersonBrief)가 "6.3지방선거를 앞두고 출마 준비" 등 **지난 일을 미래형/현재진행형**으로 서술(질의 경로는 날짜 주입했으나 인물 브리핑은 누락). 프롬프트에 **오늘 날짜(KST)+최신 기사 날짜 주입** + 지시 강화(①오늘 이전 예정 선거·계획은 과거형 ②최신 기사가 여러 달 전이면 활동을 '하고 있다'류 현재진행형 금지·과거형). 검증: 김기두 재생성 → 전부 과거형(+'강철민 지지로 군수 출마 포기'까지 정확 포착). 캐시(kg_person_bio) 25건 전량 삭제→재생성 유도. backend kg/people.ts.
- 2026-08-09 · 비로그인 랜딩 리디자인(모던 프리미엄·라이트) — 구독 전환용 첫인상 강화. 라이트 프리미엄 톤(딥틸 accent+낙조 오렌지 포인트, 사이트 토큰 유지). **히어로 라운드 그라디언트 패널**(글로우·미세 그리드·라이브 pill·그라디언트 헤드라인·통계) → 주말 수요 예측(미끼, 실데이터) → 지금 태안(라이브) → 쇼케이스 4(질의·아카이브·**지식그래프 온톨로지**·예측) → **멤버십 섹션 신설**(9,900원 요금카드+혜택 설명·**무료 vs 멤버십 비교표**·누구를 위한[사장님·효도·단체]·결제방식) → 신뢰(라이트 패널). 시안 아티팩트로 사용자 승인 후 이식. web components/home/generic-home.tsx. 후속: 멤버십/요금 페이지·모바일 폴리시.
- 2026-08-08 · 도메인 이전(→axtaeannews.co.kr) 잔여 참조 전수 정리 — 구 도메인(insight.taeannews.co.kr·api.insight…·tamemory) 참조를 전면 조사·교체. **로그인 버그 수정**: auth/router.ts safeRedirect 허용목록에 axtaeannews.co.kr 없어 카카오 로그인 후 죽은 옛 도메인으로 튕기던 것 → axtaeannews.co.kr·www 추가·fallback 교체. 그 외 sitemap.ts·robots.ts(SEO)·og/route(공유카드)·site-footer(표시)·email/router(홈 링크)·보고서 운영도메인 라인·API_BASE 폴백(article-client·ebook-review·client 주석)·봇 UA(news/ingest·kg/public_router)를 axtaeannews로. 유지: 태안신문 실도메인(taeannews.co.kr RSS·SELF_DOMAIN·문의메일)·CORS(이미 axtaeannews 포함). 477 테스트 통과. 검증: sitemap/robots 도메인 라이브 확인. ※카카오 로그인은 KAKAO_REST_KEY 시크릿 미설정(kakao_not_configured 503)이라 키 설정 필요(도메인과 별개).
- 2026-08-08 · 취재 레이더 → 기자 Web Push 배정 — 취재 레이더 각 개체에 '기자 배정' 버튼: 공백 개체를 골라 **기자에게 Web Push + reporter_alerts 적재**(하루 1회 멱등, ref_key=coverage:id:날짜). 기존 알림 인프라(dispatcher·reporters·push_subscriptions·runReporterAlerts 패턴) 재사용, 추가형(기존 기능 무변경). 메시지="📡 취재 배정: {개체} — {N개월 무보도} 후속취재 요청". backend reporter/assign.ts(coverageAssignMessage 순수+3테스트·assignEntityCoverage)·`POST /api/admin/kg/coverage/assign`, web kg.ts·coverage-radar.tsx(배정 버튼·결과 표시). 473 테스트 통과.
- 2026-08-08 · 온톨로지 Phase 3 후속 3종(검수 승격·취재 레이더·인물 소속 근거) — **①검수 승격**: 소속 후보 중 기계적으로 확실한 것(신뢰도≥0.8 & count≥10 & 조직명이 인명 미포함=오탐필터)만 보수적 승격 → **201건 verified=1**(가세로·진태구·윤형상→군수, 이용희·신경철→의장, 류진원→서장 등). 애매·중복(축제 변형)은 사람 몫으로 UI에 잔류. 되돌리기 가능(verified=0). **②취재 레이더(액션층)**: 온톨로지 개체(조직·사건·정책)별 아카이브 최근 보도·공백 집계 → 6개월+ 무보도=후속취재 후보. /admin/kg 📡취재 레이더 탭(정체순, 공백만 필터). backend kg/coverage.ts(순수 coverageStatus+3테스트·Promise.all 병렬 집계)·`/api/admin/kg/coverage`(D1 12h 캐시). **③인물 소속 grounding**: 승격된 verified=1 소속을 질의 인물에 연결 → "가세로는 어디 소속?"→근거 "가세로 — 소속: 태안군청(군수)"→답변 정확. kg/ontology_evidence.ts buildAffiliationFacts + router buildOntologyEvidence(개체+인물 병렬). 470 테스트 통과. web kg.ts·admin/kg/coverage-radar.tsx. **①→③ 파이프라인 종단 작동**(승격할수록 AI 근거 확대).
- 2026-08-08 · 온톨로지 확장 Phase 3(AI 근거 통합) — **지식그래프가 AI 답변을 뒷받침**(온톨로지를 만든 목적=지어내기 방지 완성). 질의에서 조직·사건·정책 개체를 별칭 최장일치로 감지 → **verified=1 사실·관계만** 근거로 주입(검수 안 된 verified=0 미사용). 개체 attrs(종류·날짜·상태·출처)+방향별 관계(주관/추진/개최지/관련/소속/역임)를 한 줄 근거 블록으로. 종단 검증: "태안튤립축제 누가 주관·어디서"→답변 "태안군청 주관·코리아플라워파크"(근거 표시), "태안 기름유출"→"2007-12-07·허베이스피릿호", "가로림만 조력발전"→"무산·태안군청 추진". 비개체 질의(날씨)엔 미주입(과다매칭 0). 메인·그래프 경로 양쪽에 additive(기존 경로 무변경, try/catch fail-open). backend kg/ontology_evidence.ts(순수 detect·format+8테스트)·query/router.ts(buildOntologyEvidence, 조립부 2곳). 467 테스트 통과. **후속**: 소속/축제 검수 승격분이 늘수록 근거 자동 확대(person 소속 grounding은 detectPersonInQuery 연동 시 활성). Phase 3 액션층(취재 배정·알림)은 별도.
- 2026-08-08 · 온톨로지 확장 Phase 2b(사건·정책) — 조직·인물·장소·품목을 사건·정책으로 엮음("태안 기름유출은 무엇", "튤립축제 주관·개최지·품목"). kg_ontology에 **사건(event)·정책(policy) 개체 + 주관(hosts org→event)·추진(drives org→policy)·개최지(held_at event→place)·관련(relates event→commodity)** 관계 추가. 큐레이션 시드(verified=1): 랜드마크 사건 7(기름유출2007·안면도국제꽃박람회·김용균2018 + 대표축제 튤립·낙조·대하·백합)·정책 5(기업도시·안면도관광·해양치유·가로림만조력·석탄전환)·관계 15(기존 org/place/commodity 노드 연결). **축제 169개 자동추출**(verified=0): 축제 언급 기사를 규칙(제N회 ○○축제 정규화·시드/노이즈 제외·count≥3)으로 스캔→후보 노드. 검수 UI(/admin/kg 🎪축제 검수)에서 승인(verified=1)/반려(삭제). 2층 유지(승인 전 통계만). /data 지식그래프 자동 확장: **개체 7종(사건176·정책5 포함)·관계 8종**. 품질: 국화·수산물·해삼·마늘·사구·자염·주꾸미·꽃게 등 실재 다수(머드=보령·세계튤립=시드중복 노이즈는 검수). backend kg/{festival.ts(추출 순수+7테스트),event_queue.ts(큐+2테스트)}·admin_router(/events/pending·reject), tools/kg/extract-festivals.mjs, db/051_kg_event_policy.sql, web kg.ts·admin/kg/festival-review.tsx. 459 테스트 통과. 설계=docs/superpowers/specs/2026-08-08-ontology-phase2b-event-policy-design.md. 후속: 승격 축제 주관·개최지 자동연결·Phase 3(액션층)
- 2026-08-08 · 온톨로지 확장 Phase 2(조직·소속) — 아카이브 인물 34.5K를 태안군청·수협·군의회 등 기관에 연결. kg_ontology에 **조직(org) 개체 + 소속(belongs_to: person→org) 관계** 추가(스키마 무변경). 조직 시드 22개=사실층(verified=1, category·별칭·출처). **소속 후보 2,394쌍 자동추출**: 아카이브 104K 중 조직 언급 기사 36,371건을 결정론 규칙(직함 큐+조직 별칭 인접+성씨 사전, 무료·즉시·고정밀)으로 스캔→(인물·조직·직함·근거문장) 후보를 verified=0(탐색층)로 적재. 기존 person 노드에만 연결(새 인물 0), 근거 기사·신뢰도·직함·연도 attrs 보존. 검수 UI(/admin/kg 🏢소속 검수)에서 신뢰도순 승인(→verified=1=사실층·AI 근거)/반려/고신뢰 일괄. **2층 유지: 승인 전엔 통계만·답변 근거 아님(지어내기 방지)**. /data 지식그래프 자동 확장(조직 22·소속 2,394 노출). 품질: 가세로→군청·군수(n=1996)·서장/조합장/본부장/의장 정확. 태안신문 자사 바이라인 노이즈 제외. backend kg/{affiliation.ts(추출 순수+13테스트),affiliation_queue.ts(큐)}·admin_router(/affiliations·reject), tools/kg/extract-affiliations.mjs(체크포인트·재시도·격리, TS 직접 import), db/050_kg_org.sql, web kg.ts·admin/kg/affiliation-review.tsx. 설계=docs/superpowers/specs/2026-08-07-ontology-phase2-org-affiliation-design.md. 후속: 승격분 AI 근거 연결·/people 조직노드·Phase 2b(사건·정책)
- 2026-08-07 · 온톨로지 확장 Phase 1(장소·품목·취급) — 아카이브(인물·직위)와 실시간(위판·시세·예측)을 한 온톨로지로 연결. kg_ontology에 **장소(place)·품목(commodity) 개체 + 취급(handles: place→commodity) 관계** 추가(스키마 무변경, 데이터 주도). 시드(전부 verified=1·source, 멱등 INSERT OR IGNORE): 장소 14(위판장 5·해수욕장 5·관광지 4)·품목 16(수산 11·농산 5, attrs.live로 실시간 시세/위판/제철 브릿지)·취급 엣지 18(안흥→꽃게·우럭… 위판실적 근거). loadKgStats에 개체별 노드수(GROUP BY type)·관계별 엣지수(GROUP BY rel) 추가. /data 지식그래프 섹션이 자동 확장: **인물 34,510·품목 16·장소 14·직위 1** + 공동등장·**취급(place→commodity)**·역임 카운트 + 2층(탐색층/사실층 검수 32). ⚠빌드 이슈 수정: Next Data Cache(revalidate 3600)가 옛 /kg-stats 형태를 재생해 프리렌더 500 → `.next/cache` 비움 + KnowledgeGraph null-safe(m()·verified 가드). backend kg/public_stats.ts·db/migrations/049_kg_phase1.sql(원격 적용), web reports.ts KgStatsView·app/data/page.tsx. 설계=docs/superpowers/specs/2026-08-07-ontology-phase1-design.md
- 2026-08-07 · 관리자 자동화 탭 보고서로 이동 + 데이터 지도 카드 디자인 — ①⚙️자동화(JobsSection+ago+JOB_ICON+getJobs/JobStatus)를 대시보드→보고서로 이동(보고서=운영 현황+문서, 대시보드=실행·비즈니스 지표). 대시보드 12탭·보고서 8탭. ②관리자 데이터 지도(DataMap)를 리스트→**아티팩트 카드 그리드**로 재설계: 스탯 타일(소스/라이브/진행중/보류)+영역별 컬러닷+2열 카드(이름·유형배지·상태닷·비고·granularity·metric)+유형별 요약. StatTile·STATUS_DOT 추가.
- 2026-08-07 · 관리자 대시보드·보고서 역할 정리(B안: 숫자=대시보드/문서=보고서) — 중복 제거. **보고서(/admin/report)에서 💰비용·성과·📈전환·구독·🩺시스템상태 3탭 제거**(비용·성과는 대시보드에 이미 상세 존재) → 보고서=순수 문서(개요·기술·운영·로드맵·절차·데이터지도·이력 7탭). **대시보드(/admin)에 📈전환·구독(FunnelSection)·🩺시스템상태(HealthSection) 이동**(MembershipFunnelPanel·Health+Dot/Card/KV/FunnelStat 헬퍼 복사, getReportSummary·getMembershipFunnel import 추가) → 13탭. 보고서 미사용 import(getCostSummary·getRoi·getMembershipFunnel 등) 제거. 데이터 탭명 '데이터 현황'→'데이터 지도'. 두 페이지 200 검증.
- 2026-08-07 · /data 지식그래프 섹션 + 아티팩트 전체 반영 — 공개 데이터 지도에 ①지식그래프 섹션(온톨로지 설명): 라이브 통계(인물 34,511·공동등장 127만·역임 11·검수완료 14)+개체(person·office)/관계(coappears·held, src→dst) 칩+2층 구조(탐색층 공동등장 vs 사실층 검수완료=지어내기 방지)+인물탐색 링크. backend kg/public_stats.ts(loadKgStats: COUNT+kg_ontology, 민감정보 없음)·`/api/conditions/kg-stats`(6h 엣지캐시). ②데이터 소스별(막대)·유형별(항목명)·범례·각주 추가로 참고 아티팩트와 동일 구성. web reports.ts getKgStats·app/data/page.tsx KnowledgeGraph.
- 2026-08-07 · 공개 "데이터 지도" 메뉴(/data) — 예측·경보·시세에 쓰는 데이터 소스를 영역·유형·상태로 분류한 **공개 페이지**(플랫폼 데이터 깊이 투명 공개=신뢰·구독 동인). 관리자 데이터맵 아티팩트 디자인을 사이트 정식 메뉴로. backend report/catalog.ts(공개 카탈로그 DATA_CATALOG 26종, 라이브·진행중만·깔끔한 공개설명+출처)·`/api/conditions/data-map`(공개). web reports.ts getDataMap·app/data/page.tsx(PageHeader+영역별 그리드 카드[이모지·유형배지·출처·상태닷]+유형별 요약, 사이트 토큰)·nav.ts "데이터 지도" 추가(비로그인 노출). 6영역: 관광·바다·수산·농업·날씨안전·지역경제. 검증: axtaeannews.co.kr/data 렌더.
- 2026-08-07 · 관리자 보고서 "데이터 지도" — 예측 소스 26개를 영역(관광·바다·수산·농업·날씨·안전·지역경제)·유형(예측·경보·시세·실측·달력·구조·검증·요인)·상태로 분류 표시. backend report/router.ts에 DS_CLASS 맵(key→cat/type) 추가·dataSources에 병합. web report.ts 타입(cat/type)·admin/report DataMap 컴포넌트(영역별 그룹+유형 배지+상태 요약: 라이브/진행중/보류·미채택 카운트, 유형별 집계). 관리자 📦데이터 현황 탭. 참고 아티팩트(공유용 데이터 지도)도 별도 발행.
- 2026-08-07 · 양식 수온 경보(고수온·저수온) 임시버전 — 태안 양식 어가(우럭·전복·굴·김) 폐사 조기경보. 고수온 관심27·주의28·경보29℃ / 저수온(냉수대) 주의5·경보3℃. 위험(관심+)일 때만 /live 지역경제 노출(fog처럼 평소 숨김). **⚠️임시=표층 수온(KHOA 만리포·꽃지, marine 재사용) 근사** — 정밀 양식장 수온·**용존산소(빈산소)**는 국립수산과학원 실시간어장정보(data.go.kr 15058376) **활용신청 후 정식화**(2026-08-07 재확인해도 아직 code30 미등록). backend aqua.ts(+6테스트, aquaStatus 순수)·`/api/conditions/aqua`(1h캐시)·report/router(status=progress), web reports.ts·AquaCard. 검증: 수온 26.2℃=정상(숨김).
- 2026-08-06 · 산불위험 지수 + 영농 경보(조건부) — ①산불위험(공공안전·국립공원): 건조특보·최저습도·최대풍속·계절 건조기(봄3-5·가을~초겨울)로 낮음~매우높음. 높음+일 때만 /live 노출(fog처럼 평소 숨김). ②영농경보(농업 사장님): 서리(봄·가을 최저≤3)·한파(≤-5)·폭염(최고≥35) 기상경보 + 이번달 파종/수확 적기(마늘·양파·감자·고추·생강·고구마 큐레이션). 경보/할일 있을 때만 노출. 둘 다 단기예보(REH·WSD·TMN·TMX)+특보 재사용, 새 키 불필요. backend fire_risk.ts(+5)·farm.ts(+6테스트, scoreFireRisk·farmAlerts·farmTasks 순수)·`/api/conditions/fire-risk`·`/farm`(1h캐시)·report/router, web reports.ts·FireRiskCard(/live 날씨)·FarmCard(/live 지역경제). 검증: 8월 산불 낮음(숨김)·고추 수확적기. ※예측 적중률 공개는 백테스트 3주말뿐이라 보류(~5주+ 시).
- 2026-08-06 · 위판 물량·값 추세 예측 — "다음 주 안흥, 뭐가 많이 나고 값 어떨까"(수산 사장님·중매인·식당 사입, 유료 쐐기). 위판 경매가(auction.ts) 데이터를 예측으로 확장: 최신 위판일 vs 약 1주 전(±) 비교 → 어종별 물량·경락가 주간 변화%+전망라벨(값 강세/약세·물량 늘어 안정세/물량 줄어 강보합·보합). fishOutlook 순수(값 중심). auction.ts에서 fetchOrgDay·TAEAN_ORGS export 재사용, 두 날짜 집계. Worker 직접(해수부 위판 API), 새 키 불필요, 6h 엣지캐시(호출 多). backend auction_forecast.ts(+6테스트)·`/api/conditions/auction-forecast`·report/router, web reports.ts·AuctionForecastCard(/live 지역경제). 검증: 08-03vs07-27 살오징어 값-18%물량+54%→약세, 서대류 값+31%물량-73%→강세.
- 2026-08-06 · 꽃·단풍 개화 예측 — 태안=서해 꽃 관광 1번지(튤립축제 대형). "지금 뭐가 피었나·만개 D-며칠"(낙조처럼 무료 바이럴 유입, 축제 캘린더 짝). 대표 12종(동백·목련·벚꽃·튤립·유채·알리움·수국·해바라기·꽃무릇·코스모스·억새·단풍) 평년 개화창 큐레이션 → 오늘 기준 상태(만개/개화중/절정지남/개화전/종료)+만개 D-day(순환거리, 동백 연말wrap 처리). 지금 볼 수 있는 꽃 + 다가오는 개화(D-45 이내). 새 키 불필요(날짜계산). backend bloom.ts(+6테스트, bloomStatus 순수·doy)·`/api/conditions/bloom`·report/router, web reports.ts·BloomCard(/live 관광, 핑크 그라디언트). 검증: 8월 해바라기 만개·꽃무릇 D-45. ※GDD(적산온도) 정밀보정은 향후.
- 2026-08-06 · 미세먼지 예보(충남 PM10·PM2.5) — 오늘~모레 예보 등급(좋음/보통/나쁨/매우나쁨). 태안화력 인접이라 주민 건강 관심 높음. 현재 미세먼지(에어코리아 실시간, WeatherAirCard)의 예보판. 소스: 에어코리아 대기질예보통보 getMinuDustFrcstDspth(B552584, 기존 DATA_GO_KR_KEY로 동작 — 별도 활용신청 불필요). 시도(충남) 단위 등급 파싱(informGrade "충남 : 보통"), 예보대상일별 최신발표 채택. ⚠️간헐 SERVICETIMEOUT_ERROR → 재시도 로직. backend dust.ts(+6테스트, cityGrade·latestByDate 순수)·`/api/conditions/dust`(D1 엣지캐시 3h)·report/router, web reports.ts·DustCard(/live 날씨·대기질, PM10/PM2.5 오늘·내일·모레 표+등급색). 검증: 충남 08-06·07 좋음.
- 2026-08-06 · 해무(바다안개) 예보 — 서해안 해무 위험도 3일(통근·낚싯배 출항·관광 가시거리 안전). 해무 관측(seafog CCTV)의 예측판. 습도(지배요인)·기온-수온차(이류무: 따뜻습한 남풍이 찬 서해 위)·풍속(약~중풍 이류 최적, 강풍 흩어짐)·풍향(남풍 유입) 종합→0~100+등급(짙은해무/해무가능/옅은안개/양호). **저습도(<75%) 게이트**로 건조일 양호. 기상청 단기예보 새벽0600(REH/TMP/WSD/VEC)+당일 수온(marine), 새 키 불필요. backend fog.ts(+5테스트, scoreSeaFog 순수·습도게이트)·`/api/conditions/fog`(D1 엣지캐시 1h)·report/router, web reports.ts·FogCard(/live 바다·해변, **worst<40이면 숨김** — 뜨면 곧 주의신호). 검증: 08-07 습도85%=옅은안개25.
- 2026-08-06 · 제철 수산물 최적 타이밍 — 태안 대표 수산물 제철 달력 + 현재 위판 경락가(관광객 식도락·소비자용). 어종별 성수기 월 큐레이션(대하 9~10·꽃게 봄가을·우럭·주꾸미·바지락 봄·낙지 가을·붕장어/농어/전복/오징어 여름·광어/간재미/굴/감태 겨울) → '이번 달 제철/다가오는 제철(임박)' 분류. auction 경락가를 alias 부분일치로 오버레이(붕장어 16,830·오징어 11,784 자동매칭). 새 키 불필요. backend seasonal.ts(+7테스트, peakStatus/seasonalCalendar 순수)·`/api/conditions/seasonal`(D1 엣지캐시 6h)·report/router, web reports.ts·SeasonalCard(/live 지역경제). ※표 갱신 시 kv_cache DELETE로 무효화.
- 2026-08-06 · 커스텀 도메인 연결 axtaeannews.co.kr — 가가도메인(아사달, 회원 chs9182)에서 .co.kr 등록 → Cloudflare 존 추가(계정 c87a0e9…, Workers와 동일) → 가가도메인 네임서버를 hal/jo.ns.cloudflare.com으로 변경(⚠️가가도메인은 IP 필수라 각 173.245.59.174/173.245.58.172 입력, 외부 NS라 원래 불필요하나 폼 강제). 웹 Worker(taean-insight) wrangler.jsonc에 routes[axtaeannews.co.kr·www custom_domain]+workers_dev:true(폴백 유지). apex 인증서 발급 ~십수분(www 먼저 200). layout.tsx metadataBase를 옛 insight.taeannews.co.kr→axtaeannews.co.kr, admin APP_URL도 교체. **커스텀 도메인이라 Cloudflare Cache API 활성화(workers.dev no-op 해소)**. 남음: QR·광고 링크 교체, api 서브도메인(옵션).
- 2026-08-06 · 낙조(노을) 예보 — 태안=서해 낙조 명소(꽃지·만리포·백사장) "오늘 노을 예쁠까"(무료 유입·공유 쐐기, 낚시=유료전환과 짝). 하늘상태·습도·미세먼지·일몰시각 종합→0~100+등급(환상적/좋음/보통/흐림/기대난망). 노을원리: 구름많음(중상층운)=빛 물듦 최고·맑음=밋밋·흐림=가림·비=베토. 청명(미세먼지↓·습도↓)=선명. 데이터 전부 보유·새키 불필요: 기상청 단기예보 SKY/REH/PTY(일몰 정시)+에어코리아 PM10(오늘)+일몰(marine sunTimes export, NOAA 계산). backend sunset.ts(+6테스트, scoreSunset 순수·강수베토)·env/router `/api/conditions/sunset`(D1 엣지캐시 1h)·report/router, web reports.ts·SunsetCard(/live 바다·해변, 노을 그라디언트). 검증: 08-06~08 맑음=보통58·일몰19:38.
- 2026-08-06 · 낚시 출조 지수(배낚시·선상) — 신진도·안흥 근해 3일 예보 "언제 배 뜰까·뭐 잡힐까"(낚시꾼·낚싯배 유료 쐐기). 안전(파고·풍속·풍랑특보=**안전 베토**로 출조자제 강제)×조과기대(물때·수온·제철어종 가점)→0~100+등급(최적/좋음/보통/주의/출조자제). 데이터 전부 보유·새키 불필요: 기상청 단기예보 파고(WAV)·풍속(WSD) 근해격자(nx49,ny108, WAV 제공 확인)+KHOA 조석(mudflat fetchTideEvents/tidalRangeM 재사용, 만조·간조 시각+조차)+당일 수온(marine)+풍랑특보(weather_alert). 제철어종표 큐레이션(우럭 연중·주꾸미 가을·갑오징어 봄 등). 검증: 08-06~08 최적88(파고0m·미풍·중물때). backend fishing.ts(+10테스트, scoreFishingDay 순수·안전베토)·env/router `/api/conditions/fishing`(1h캐시)·report/router, web reports.ts·/beaches 낚시 섹션. 설계=낚시(유료전환)+낙조(무료유입) 세트 중 낚시 먼저.
- 2026-08-05 · 태안 위판장 경매가(산지 경락가) — 수산 사장님이 위판장에서 **실제 받는 값**(소매가 카드와 짝: 소비자 vs 산지). 해수부 위판장별 위탁판매(apis.data.go.kr/1192000/select0040List, DATA_GO_KR_KEY, 활용신청 완료)를 **Worker 직접 호출**(apis.data.go.kr는 Worker 도달 OK, KAMIS와 달리 크롤러 불필요). 전국 21k건/일 중 태안 조합 필터(서산수협 안흥·모항·채석포 + 안면도수협 백사장·영목 = 전부 태안군 연안). 어종별 물량가중 평균 경락가(csmtUntpc, 원/kg)+위판량. numOfRows 상한100 페이지네이션·mxtrNm 조합필터. 위판 3~4일 지연→최신보고일 자동탐색·6h캐시. 검증: 08-03 살오징어 11,784/kg(81톤)·넙치 21,795·서대류 46,632, 당일 위판 9.9억. backend auction.ts(+5테스트)·env/router `/api/conditions/auction`·report/router, web reports.ts·AuctionCard(/live 지역경제). ※한글 파라미터 URL인코딩 필수.
- 2026-08-05 · 수산물 소매 시세(KAMIS 어패류) — 태안 수산 사장님·주민용(9,900원 유료회원 산업 커버). 꽃게·바지락·전복·낙지·꼬막·새우·오징어·갈치 소매가+주간등락(KAMIS 부류600 소매). ⚠️Worker가 KAMIS(www.kamis.co.kr) 직접 못 닿음(HTTP 전용+HTTPS 인증서오류) → **로컬 크롤러→ingest→D1 미러**(교통량과 동일 패턴): `tools/seafood/`(refresh-seafood.mjs·run-seafood.sh·plist·.kamis_key gitignore). KAMIS는 브라우저UA 필수+HTML 차단페이지 재시도. cert_key(+cert_id=가입ID, 없으면 키로 대체). 최근5일 중 데이터 있는 최신일 자동. seafood_prices(mig 047)·`/api/conditions/seafood`·SeafoodCard(/live 지역경제). 우럭=조피볼락은 KAMIS 소매 목록 없어 제외. backend seafood.ts(+8테스트)·env/router·report/router, web reports.ts·report-charts·live/page. launchd 매일 17:10.
- 2026-08-05 · 기상특보(급감 신호) + 숙박검색 proxy: ①기상특보(기상청 WthrWrnInfoService/getWthrWrnList, 충남 stnId133, 활용신청 완료) — 통보문 파싱(태풍25·호우18·풍랑10·폭염6 등, 경보>주의보×0.6, 해제=비활성)→수요지수 ⑨특보 감산요인 + /live 안전배너(WeatherAlertBanner). 검증: 충남 폭염경보→-6, 지수 83→51. `weather_alert.ts`(+9테스트)·`/api/conditions/weather-alert`. ②숙박검색 proxy(네이버 데이터랩에 '태안펜션/숙박/캠핑' 그룹 추가→수요지수 ⑧숙박관심도) — ❌보류: NAVER가 데이터랩 검색어트렌드 API **신규 등록 자체를 중단**(기존앱 추가·신규앱 드롭다운 모두 없음 확인 2026-08-05). 코드는 완성·null-safe로 휴면(전용키 NAVER_DATALAB_* 우선 지원). 검색관심도는 수요지수 보조요인 1개라 없어도 정상. 대체 숙박수요 소스(KTO 숙박통계 등) 추후. ※방학/학사일정=실측 seasonBase에 이미 반영·이중계산 위험으로 미채택. backend src/tour/weather_alert.ts·demand.ts·env/search_trend.ts·env/router·report/router, web report-charts(WeatherAlertBanner)·live/page·lib/api/reports
- 2026-08-05 · 태안 축제 캘린더(수요 동인) 큐레이션: ⚠️TourAPI 축제는 태안 0건(충남 전체도 0)이라 무용→태안군청 문화관광 기반 큐레이션 13개 축제(월·일 from/to 반복, 매년 자동적용). 확인 실제일정: 튤립축제 4/1~5/6(대형·코리아플라워파크)·대하축제 9월말~10월(대형·백사장항). 방문자 실측 피크(5월·10월)와 정확히 일치=검증됨. festivalsOnWeekend/festivalBoost(대형+18·중형+9·소형+4·상한22)→수요지수 ⑤축제 요인 교체. `/api/conditions/festivals` + /live 관광 FestivalCalendar. 검증: 8/8~9 축제+17→지수83 매우높음. backend src/tour/festivals.ts(+9테스트)·demand.ts·env/router·report/router, web report-charts(FestivalCalendar)·live/page·lib/api/reports
- 2026-08-05 · 시민기자 공개 모집(신문광고 QR 랜딩): 광고를 본 일반인(비로그인)이 온라인 지원. 기존 citizen_applications(회원→승급)와 별개 공개 접수. mig 046 citizen_recruit + POST /api/citizen/recruit(공개·LOGIN_RL 레이트리밋·연락처 최소1개) + GET /api/admin/citizen/recruit(선발용). 공개 페이지 /citizen/apply(비게이팅 — 모집안내·'누구나' 자격·혜택(아카이브 수록)·활동예시·지원폼: 이름·연락처·읍면·연령대·관심분야·동기200자). 검증: 접수 ok·연락처없음 거부. 광고 개선 시안은 Claude 아티팩트(QR→/citizen/apply). backend citizen/recruit_router·router(admin GET)·index, web app/citizen/apply·lib/api/recruit, db/046
- 2026-08-04 · 산업 다부문 확장(사장님 멤버십=관광만 아님): ②태안 산업 구조 카드(IndustryStructure, 통계청 지역총생산·사업체조사 큐레이션 — 농업8.3%·수산·관광·에너지(태안화력 54.6%). 정밀 취업자는 KOSIS 키 연동 예정) + ③농수산물 시세에 해조류(미역76/07·다시마76/03·파래76/10) 추가(우리 키 라이브 — 검증 미역2,100·다시마4,220원/kg). ※어패류(우럭·꽃게·바지락)는 공영도매시장 API에 없음(청과 전용, 수산 0건 확정)→KAMIS 소매가 키 필요. 둘 다 /live 지역경제. web report-charts(IndustryStructure)·live/page, backend agri.ts(해조류 코드)·report/router(dataSources)
- 2026-08-04 · 태안 농산물 도매 시세(농업 사장님): 한국농수산식품유통공사 전국 공영도매시장 실시간 경매(data.go.kr 15141808, `B552845/katRealTime2/trades2`, 우리 키·활용신청 완료). 필수 cond[trd_clcln_ymd::EQ]=YYYY-MM-DD. 태안 주산지 품목(마늘12/09·생강12/10·홍고추12/08·감자05/01·양파12/01)을 대분류+중분류 서버필터→원/kg 정규화(scsbd_prc/unit_qty)·중앙값(수입·가공 제외). `/api/conditions/agri`(3h캐시)·`/live` 지역경제 AgriCard. 검증: 마늘3,000·생강7,000·홍고추3,400원/kg 전일대비. ※공영도매시장=청과 위주(수산물 없음→KAMIS 별도), 산지 필터 없어 '전국 도매 참고가'. 사장님 멤버십은 관광만 아닌 농업·수산 사장님 포함 방향. backend src/tour/agri.ts(+5테스트)·env/router.ts, web report-charts(AgriCard)·live/page·lib/api/reports
- 2026-08-04 · 갯벌 물때 적기 보드: KHOA 조석예보(안흥, 기존 DATA_GO_KR_KEY 재사용·새 키X)로 5일간 조차·낮 간조 계산 → '언제 갯벌 체험 좋은가' 점수·최적일 추천. 원리: 큰 조차(사리)=많이 드러남 + 낮 시간 간조(저조)=체험 가능. `mudflat.ts`(tidalRangeM·daylightWindow·scoreMudflatDay, +6테스트)·`/api/conditions/mudflat`·`/beaches` 페이지 🦪섹션. 검증: 8/4(화) 조차5.43m·낮간조13:31·70점 적기. ※수산물 시세는 KAMIS 소매가 키(kamis.or.kr) 또는 data.go.kr 도매경매(15141808) 활용신청 필요→대기(관리자 데이터현황 'check'). backend src/tour/mudflat.ts·env/router.ts·report/router.ts, web app/beaches·lib/api/reports.ts
- 2026-08-04 · 충남 고속도로 유입 교통량(선행지표): 한국도로공사 실시간 권역 교통량(data.ex.co.kr `trafficapi/trafficRegion`, 대전충남본부=903, 출구=진출=충남 도착 유입). ⚠️ data.ex.co.kr은 Worker가 못 닿음(타임아웃, ITS 9443과 동일)→ITS CCTV와 같은 **로컬 크롤러→ingest→D1 미러** 방식. 로컬 `tools/traffic/refresh-traffic.mjs`(도로공사키 `.ex_key`+GOV_IMPORT_TOKEN)→POST `/api/conditions/traffic/ingest`→traffic_daily(mig 045)→GET `/api/conditions/traffic` D1 서빙. launchd 1시간 주기(com.taean.traffic.plist). 검증: 출구3,430·입구1,969. 방문자 실측(지연)의 실시간 보완, 서산IC 단독 실시간 미제공→권역 프록시. backend src/tour/traffic.ts(+4테스트)·env/router.ts, db/045, tools/traffic/*
- 2026-08-04 · 수요지수 공휴일(연휴) 요인 복구: 운영 DATA_GO_KR_KEY가 특일정보(공휴일) API 미등록이라 연휴 가산이 조용히 빠지던 문제. '한국천문연구원 특일정보' 활용신청(방문자 API 키=DATA_GO_KR_KEY_TOUR 계정)→검증(광복절 8/15·대체 8/17 조회 성공). forecastDemand의 fetchHolidays가 holKey=DATA_GO_KR_KEY_TOUR||DATA_GO_KR_KEY 사용(날씨·축제는 기존 키 유지). backend src/tour/demand.ts
- 2026-08-04 · 관리자 보고서 '데이터 소스 현황' 상설 기록: 관광 분석 데이터의 상태를 관리자 보고서 📦데이터 현황 탭에 기록. /api/admin/report/summary에 dataSources[] 추가(라이브 지표=방문자 행수·범위·정답채움 주말수 + 상태=live/progress/check/parked/rejected). 항목: 방문자실측·백테스트정답·해변보드(live), 공휴일(check=키 미등록 가능), 교통량(progress=서산IC 대기), 관광소비/수요강도/다양성(parked=빈응답), 관광지점입장객(rejected=해수욕장 누락). 네비에 '해변'(/beaches) 추가. backend src/report/router.ts, web app/admin/report/page.tsx·lib/api/report.ts·lib/nav.ts
- 2026-08-04 · 해수욕장 보드(해변별 세분화): 태안 관광 본체인 해수욕장을 지점 단위로. `/api/conditions/beaches`(loadMarine + rankBeaches: 해수욕지수·파고안전·수온 종합 0~100 적합도·랭킹). 공개 페이지 `/beaches`(오늘의 추천 해변 + 해변별 카드). 데이터는 이미 수집중이던 KHOA+기상청 해변자료 재사용(새 의존성 0). 검증: 라이브 신두리79·꽃지74·만리포74·학암포73. ※시군구 이하 세분화 조사 결론: 관광지점 입장객(문화관광연구원)은 태안 5개 시설뿐·해수욕장 누락→미채택, 면단위 유동인구는 무료불가. backend src/tour/beach_board.ts(+6테스트)·env/router.ts, web app/beaches·lib/api/reports.ts
- 2026-08-04 · 관광 수요 실측(정답 데이터) 연동 + 계절 가중치 재보정: 한국관광공사 빅데이터 지역별 방문자수(data.go.kr 15101972, DataLabService/locgoRegnVisitrDDList, 태안 signguCode=44825, 외지인+외국인=관광객)를 tour_visitors에 적재. API는 지역필터 없어 전체 받아 로컬 필터·HTTPS 전용. mig 044 + 3년 백필(3,207행/1,069일, 2023-08~2026-07). cron이 신규 방문자 수집 + tour_demand_log.actual_visit(예약돼 있던 정답 컬럼) 채움 → 기존 백테스트(computeBacktest)가 검색관심도 대용 대신 실측 정답으로 가동. 3년 실측으로 seasonBase 데이터 재보정(7월 45→33=장마·폭염 고평가 교정, 10월 28→44·5월 32→43=봄·가을 저평가 교정, 8월=45 정점 유지, 주말 실측 평일 1.86배). 검증: 06-20 예측53→실측16.1만명·06-27 예측72→실측18.7만명(예측·실측 동행). backend src/tour/visitors.ts(+7테스트)·demand.ts(seasonBase)·index.ts(cron), db/migrations/044, tools/tour/backfill-visitors·analyze-visitors
- 2026-08-03 · 수집 관측성: 관리자 보고서 '데이터 신선도'에 '마지막 수집 실행'(news_cache.updated_at, KST) 추가 — 최신 기사 날짜와 대조해 '수집기 고장 vs 새글 없음' 구분. backend/src/report/router.ts, web app/admin/report·lib/api/report
- 2026-08-03 · 방문자 홈 가독성 정리: 히어로 h1 text-display(≤72px)→text-3xl~5xl(≤48px), 섹션 간격 space-y-20→14, 히어로/쇼케이스/신뢰 섹션 제목·마진 축소(과대 여백·거대 제목 정리). web/src/components/home/generic-home.tsx
- 2026-08-03 · 방문자 첫화면에 '이번 주말 관광 수요 예측' 미끼 카드(#1): 기존 수요지수 엔진(GET /api/conditions/demand — 날씨·물때·축제·연휴·계절 규칙기반 0~100)을 공개 방문자 홈(GenericHome)에 대표 예측으로 노출. getWeekendDemand() 클라이언트 + WeekendDemandCard(지수·등급·근거요인·주말날씨) + 사장님 멤버십 전환 미끼 + 적중률 고지. 무료 지수=hook, 사장님 상세=전환 구조. 검증: 비로그인 홈에 67/100·높음·근거 표시 확인. web lib/api/reports·components/home/generic-home
- 2026-08-03 · 로그인 아이디(username) 지원: 이메일 없이 단순 아이디로 로그인. mig 043 users.username(부분 유니크). /login이 id(username 또는 email)로 조회(WHERE username=? OR email=?, 하위호환 email 필드도 수용). 기자 생성은 username 기반(이메일 미입력 시 내부 합성 이메일로 NOT NULL 충족). 로그인 폼·관리자 생성폼·회원표 아이디 표시로 변경. 검증: 테스트계정 username 로그인 토큰발급·오답거부 확인. backend auth/router·admin_router, web login-client·lib/api/auth·admin·app/admin/page, db/043
- 2026-08-03 · 회원 관리 수정·삭제: 관리자 👥회원표에 '관리' 열(이름·비번·삭제) 추가. /set에 displayName(이름수정), 신규 /reset-password(비번 지정/자동→1회 반환·기존 세션 무효화), /delete(상위등급·최종관리자·본인 삭제 금지, 세션 함께 삭제). 프런트는 prompt/confirm로 처리. 검증: 테스트계정 생성→이름수정→비번재설정→삭제 API 왕복 확인(잔여 없음). backend auth/admin_router, web lib/api/admin·app/admin/page
- 2026-08-03 · 태안신문 기자 계정 직접 생성(관리자): 지금까지 '본인 가입→관리자 역할부여'만 되던 것을, 관리자 👥회원 탭에 '📰 기자 계정 만들기' 추가. POST /api/admin/users/create(superadmin, reporter 임명 게이트 동일) — 이메일+이름 입력, 비밀번호는 직접 지정(8자+) 또는 비우면 서버가 자동 생성(14자·혼동문자 제외)→pw_hash로만 저장, 응답에 임시비번 1회 반환→화면에만 표시(복사). role=reporter로 생성. 비번은 채팅·코드·깃에 안 남김. 검증: 테스트 계정 생성→임시비번 표시→역할 기자 확인→삭제. backend auth/router(hashPw·randHex export)·auth/admin_router, web lib/api/admin·app/admin/page
- 2026-08-03 · 기사 본문 가독성(줄간격 축소): 본문 줄간격 leading 1.9→1.7·문단간격 space-y-5→4·폰트 1.05→1.02rem — 과도하게 airy하던 여백 정리. 글자크기 토글(가/가+/가++)은 rem 스케일이라 비례 유지. web/src/app/news/[id]/article-client.tsx
- 2026-08-03 · 기사 사진 레이아웃(사진 맨 위+캡션 중앙): 뉴스 기사 FullBody에서 리드 사진(images[0])을 본문 위로 올리고, 본문 첫 문단이 짧으면(≤45자=사진설명) 분리해 사진 아래 <figcaption>(중앙)으로 배치. 나머지 사진은 본문 아래 유지. 캡션 없는 기사는 사진만 위로. web/src/app/news/[id]/article-client.tsx
- 2026-08-03 · 인물 소개 품질 일괄 점검(브리핑 대비): 캐시 25건+표본 점검 → 로마자 오출력 2건 발견(김영삼 'existed', 한상기 'demokracy'=민주주의). 평문 ASCII 필터가 약어(AI·CSV) 보존 위해 통과시키던 허점. 수정: 4자+ 평문 라틴 연속을 오염으로 감지(재시도 트리거 + stripHanja 제거, ≤3자 약어는 보존) + 재시도 지시에 '한국어 단어를 로마자로 바꾸지 마라(민주주의→demokracy 금지)' 예시 추가. 한상기 재생성=클린(491자). 전직 대통령 6명(김영삼·김대중·노무현·이명박·노태우·전두환) 억제 목록 추가→위키 대체. 광역 인물(김태흠·안희정·양승조·박수현)·지역 국회의원(성일종) 소개는 정확·관련 있어 유지. 소스 재확인: 태안신문 여전히 07-24 최신(신규호 없음, 수집기 정상 확정). backend/src/kg/people.ts, tests/kg_people.test.ts
- 2026-08-03 · 바이라인(기자) AI 소개 억제 — 심각 오류 수정: 신문웅·김동이(태안신문 기자, 등장≥5000 초허브)의 AI 소개가 '태안군수를 지내며…'로 완전 오작성(그들이 쓴 기사 주제를 본인 행위로 오인). isPersonHub(등장≥HUB_MENTIONS) 추가 → /brief가 {brief:null,suppressed:true,byline:true} 반환·생성 안 함, /profile은 초허브에 위키 사진도 안 붙임(오매칭 방지). 프런트는 '기사 작성자(기자·편집인)로 보여 소개 미제공, 등장 수는 쓴 기사 수' 안내. 잘못된 캐시(신문웅) 삭제. 검증: 신문웅·김동이=byline 억제, 가세로=정상 유지. backend/src/kg/people.ts·public_router.ts, web kg-public·people/page
- 2026-08-03 · 태안군의회 역대의원(1~9대) 공식 사진: council.taean.go.kr 역대의원(sess_id=1~9, 서버렌더)에서 42명 이름·사진 스크랩→R2(council/hNN.jpg) 미러→council_members.ts HISTORICAL_COUNCIL 맵(41명, 현직 김영인 제외). councilPhotoFor가 현직(10대)→역대(1~9대) 순 조회. 인물 탐색 아바타에 자동 반영 — 우리 KG 인물 다수(김진권·정광섭·전재옥·신경철·이용희·박용성·김기두 등)가 사진 획득. 검증: 김진권 초상 브라우저 확인, 4명 photo URL 확인. (스크래퍼: scratchpad/scrape_council.mjs·mirror_council.mjs) backend/src/kg/council_members.ts
- 2026-08-03 · 위키백과 인물 사진을 아바타로(R2 없을 때): 군수·의원 R2 사진이 없는 인물(도지사·국회의원 등)에 위키백과 대표사진을 아바타로 사용. mig 042 wiki_cache(7일 TTL, found=0도 캐시→페이지 없는 인물 재요청 방지)로 위키 요약·사진 캐시 — /profile이 R2 사진 없으면 getWikiCached 썸네일을 photo(절대 URL)로, /brief 억제 인물 요약도 같은 캐시 공유(중복 fetch 제거). fetchWikiSummary는 AbortController+setTimeout(4s)로 안전(AbortSignal.timeout 대체). 프런트 아바타는 절대(위키)/상대(R2) URL 모두 처리, 억제 소개 박스의 중복 썸네일 제거(아바타가 얼굴 표시). 우선순위 R2→위키→없음. 검증: 김태흠·안희정·성일종=위키 사진, 가세로=R2 유지, 김진권(로컬·위키無)=null. ※동명이인 흔한 이름은 오매칭 가능(미검증 고지 하). backend/src/kg/public_router.ts, web app/people/page.tsx, db/042
- 2026-08-03 · 인물 탐색에 군수·군의원 공식 사진: buildPersonProfile에 photo 필드 추가 — 이름으로 mayorPhotoFor(역대 군수 12명)·councilPhotoFor(현직 군의원 7명) 조회해 R2 사진 URL(/api/archive/photo/mayor|council/NN.jpg) 반환(기존 AI질의 카드용 함수 재사용). 프런트 프로필 헤더 이름 옆에 원형 아바타(64px, API_BASE_URL 접두, onError 시 숨김). 검증: 가세로·윤희신=군수 사진, 김영인=의장 사진, 그 외 인물은 photo:null 미표시. backend/src/kg/people.ts, web kg.ts·app/people/page.tsx
- 2026-08-03 · 전국 인물 위키백과 요약 대체: AI 소개 억제된 전국 인물(윤석열·문재인 등)에 '지역 AI 소개 미제공' 안내만 뜨던 것을 한국어 위키백과 요약으로 대체(정확·출처있음). /person/:id/brief가 suppressed일 때 fetchWikiSummary(노드 이름 → ko.wikipedia REST summary, 무료·키 불필요)로 extract·썸네일·링크를 wiki 필드로 반환(동음이의/미존재 null, max-age 86400). 프런트는 '위키백과 요약' 배지+썸네일+요약+출처 링크(CC BY-SA 준수). 검증: 문재인=제19대 대통령+사진, 윤석열=재임 2022~2025·비상계엄 정확. ※AbortSignal.timeout은 이 Worker 런타임서 throw → 제거(디버그로 규명). backend/src/kg/public_router.ts, web kg-public·people/page
- 2026-08-03 · 전국 인물 AI 소개 억제(팩트·관계망만 노출): 윤석열·이재명 등 전국 정치인은 지역 아카이브에 파편적으로만 등장 → AI 소개 품질↓·정치적 민감. mig 041 kg_bio_suppressed 테이블(명확한 전국 정치인 14명 시드, superadmin이 행 추가/삭제로 관리)에 있으면 /person/:id/brief가 {brief:null, suppressed:true} 반환하고 생성 안 함. 쿼리 경로(buildPersonBriefCard)도 카드 미첨부. isBioSuppressed(db,id) 헬퍼 공유. 프런트는 AI 서술·'AI 요약' 배지·'미검증' 고지를 숨기고 '전국 인물이라 지역 AI 소개 미제공' 안내 + 팩트 스트립·주제·관계망은 유지. 검증: 윤석열/이재명=suppressed·안내표시, 가세로(로컬)=정상 캐시. backend kg/people·public_router, query/router, web kg-public·people/page, db/041
- 2026-08-03 · 인물 브리핑 시제·상태 정정(끝난 직책 현재형 금지): 브리핑이 '윤석열은 대통령 직책을 맡으며 주력한다'처럼 끝난 직책을 현재형으로 단정하던 버그(같은 글에서 무기징역 판결 언급하면서). 프롬프트에 '직책·상태는 가장 최근 기사 기준, 퇴임·낙선·구속·기소·판결·사망 변화 시 옛 직책 현재형 금지(전 대통령·피고인 등 시점 표현)' + 취임선서·원론 문구('헌법 준수·국가 보위' 류) 금지 추가. 첫 문장도 '현재 상태' 기준으로. 윤석열 재생성→'2026년 5월 현재 무기징역 선고받은 상태'로 정정 확인. (단 국가급 인물은 지역 아카이브 언급이 파편적이라 타인 행위 혼동 등 품질 한계 잔존 — 별도 논의) backend/src/kg/people.ts
- 2026-08-03 · 인물 브리핑 최신성(자동 무효화 + 최신 기사 날짜 표시): 브리핑이 kg_person_bio에 영구 캐시라 새 기사가 들어와도 안 바뀌던 문제. ①mig 040으로 latest_article 컬럼 추가 — 생성 시점의 인물 최신 기사 날짜 저장, /person/:id/brief 조회 때 현재 최신 기사 날짜와 다르면(새 기사 유입) 자동 재생성. 기존 행(NULL)은 다음 조회 때 1회 재생성되며 채워짐. ②프런트 팩트 스트립에 '최신 기사 YYYY.MM.DD'(+2개월↑이면 '최근 소식 없음') 표시 — 데이터가 언제까지의 것인지 명시(예: 박용성은 6월 선거 후 기사 없어 5/29가 최신, 낡은 게 아님). backend/src/kg/public_router.ts, web/src/app/people/page.tsx, db/040. ※별건: 아카이브 수집이 2026-07-24 이후 정체(수집기 점검 필요)
- 2026-08-03 · 인물 프로필 조회 속도 개선(병렬+상위 LIMIT): buildPersonProfile이 관계망·함께등장·기사·직위·추이·주제 6쿼리를 순차로 돌던 것을 Promise.all 병렬로. + 고차수 인물(가세로 인접 4천 엣지)에서 인접 엣지를 통째 전송하던 것을 SQL ORDER BY weight/count DESC LIMIT(personEgo 400·coappear 120)로 축소 — 상위 12만 표시하므로 결과 불변. 결과: 가세로 profile 1.7s→0.8s(윤희신 ~1.1s, json_extract 정렬 비용). backend/src/kg/people.ts·graph.ts
- 2026-08-03 · 관계망 미검수 관계명 확대(안전 유형 점선): '검수된 것만' 정책이 너무 좁아 라벨이 1개만 보이던 문제(윤희신=검수2·AI라벨~20). 저위험 유형(협력·동료·전임·후임·소속상하)은 미검수도 '점선(AI 추정)'으로 표시, 민감(대립·갈등·가족·인척)은 검수분만 실선. 중심↔이웃은 coappear의 verified로 정확 적용, 이웃끼리(mesh)는 verified 미상이라 안전 유형만 점선. kg-graph에 estimated(점선 line+pill) 추가, 경고문·범례에 '실선=검수/점선=AI추정' 명시. web kg-graph.tsx·app/people/page.tsx
- 2026-08-03 · 인물 소개글 가독성(문단 분할): 한 덩어리 <p>이던 AI 소개를 briefParagraphs로 문장 단위 분할 — 첫 문장=리드(굵게), 이후 2문장씩 문단(space-y-2.5). web/src/app/people/page.tsx
- 2026-08-03 · 시민기자 모집 안내 조정: 공고 7월중→8월 중, 발행량 1인당 6편→4편, 원고료 편당 5만원·1인당 총 20만원 명시. 운영 일정도 8월 공고에 맞춰(준비 7월·모집 8월중·교육 8월말·활동 9~11월). web/src/app/citizen/page.tsx
- 2026-08-03 · 인물 브리핑 외국문자 누출 방어(hasForeignScript+재작성): Workers AI가 프롬프트('외국문자 금지')를 어기고 로마자 음차(베트남어 'xuất'=出)·일본어(の·さらに·を)를 섞어 내던 문제 — 프롬프트만으론 이미 실패. buildPersonBrief에 3중 방어: ①생성물 검증(hasForeignScript — CJK·성조라틴·키릴·일본어 등 감지, 평문 ASCII 영문 AI·CSV는 허용) ②오염 시 강화 프롬프트로 1회 재작성 ③그래도 남으면 stripHanja 결정론 정제(성조 라틴 토큰 통째 제거+외국문자 삭제). 프롬프트도 '한글·숫자·문장부호만' 명시 강화. 캐시(kg_person_bio) 오염 4건(이성엽·지재규·전재옥·정광섭) 삭제→재생성 전부 CLEAN 확인. FOREIGN_CHAR는 리터럴 경계문자 대신 \\u 이스케이프(한글 오삭제 방지). backend/src/kg/people.ts, tests/kg_people.test.ts
- 2026-08-03 · 관계망 이름 클릭 안정화(kg-graph): 호버하면 이웃이 비켜나며 computeFit이 매프레임 배율(sx/sy) 재계산→겨냥한 노드 화면 위치까지 이동해 '이름이 안 잡히던' 문제. 해법 ①커서에 '홈'이 가장 가까운 노드를 항상 제자리 고정(near·hk0.35·반발 제외)해 클릭 대상 확정, ②호버 중 표시배율 동결(fitFrozen — draw()가 computeFit 건너뜀; 커서 이탈+정착 시 해제, resize 리셋)로 겨냥한 이름이 커서 밑에서 안 움직이게. 검증: 가세로 그래프 '이성엽' 이름 클릭→이성엽 프로필 이동 확인. web/src/components/kg-graph.tsx
- 2026-08-03 · 관계망 이름 라벨도 클릭 이동(kg-graph): 기존 pick()은 원(반경)만 히트→이름 글자 클릭 무반응이던 것을, 원 아래 라벨 박스(폭 ~name.length*8, 원아래 2~22px)도 히트에 포함. 커서도 이름 위에서 pointer(onMove가 pick 사용). people/page 안내 '원·이름 클릭 시 이동'으로 갱신. web/src/components/kg-graph.tsx·app/people/page.tsx
- 2026-08-02 · 관계망 호버 잔움직임(kg-graph): 마우스를 그래프에 대면 커서 근처 노드가 살짝 밀렸다가 홈으로 스프링백. 정착 시 홈좌표 기록(setHomes), 표시변환 역산(toNatural)으로 커서를 자연좌표로 변환, hoverTick(반발 R62·homeK0.10·damp0.72)이 마우스 있거나 미정착 동안만 돎(정지 시 rAF 해제). 중심 고정, prefers-reduced-motion 존중(잔움직임 생략). web/src/components/kg-graph.tsx
- 2026-08-02 · 관리자 네비 지식그래프(KG) 링크: 파일럿 잔재라 잠시 숨겼다가, 태안신문사 담당자 브리핑용으로 **복원**(대시보드·지식그래프·보고서). web/src/components/admin-header.tsx
- 2026-08-02 · 예보 적중률 증명(#2-①): 방문객 실측이 없어 '예측 신뢰'를 검증가능한 날씨로 증명 — 중기예보(fetchMidForecast)를 forecast_log(mig 039)에 미래날짜 INSERT OR IGNORE(리드타임 정직), 자정 크론 fall-through에서 record+resolve(대상일 지나면 env_daily 관측과 대조: 강수 적중=pop≥50 vs 관측 pty, 기온오차=|예보tmax−관측temp|·±2℃). 공개 GET /api/reports/forecast-accuracy(:weekId보다 먼저 등록·30분캐시). 멤버십 페이지 ForecastTrust 위젯(집계 전엔 '집계 중'). 검증: 집계 SQL 시드2건→강수0.5·MAE1.35·±2 1.0. backend reports/{forecast_accuracy,router}·index.ts, web membership/page·api/report, db/039
- 2026-08-02 · 오너 준비 알림 푸시(#2-③): 매일 07:00 KST(기존 0 22 * * * 크론 재사용, 새 크론 X) sendOwnerAlerts — '주목할 날'(수요 매우높음/매우낮음·안전경보·주말우천·수요급변 추세·행사 D-0/1)에만 사장님에게 Web Push('지금 준비하세요'). 평상시엔 조용(스팸 방지). 본문=상위 액션(의사결정형 ②)+안전, 데일리 tag 중복대체. 발송기계는 sendWeeklyOwnerPush(VAPID·dispatcher·prefs·loadOwnerBrief) 재사용. 프런트 오너 '경보·알림' 문구 갱신. backend owner/weekly_push.ts·index.ts, web owner-home.tsx
- 2026-08-02 · 사장님 실행 제안 의사결정형 개편(#2-②): buildActions를 정량화 — 맨 위 '이번 주말 한 줄 판단'(수요지수/100·전주대비·기여요인 topN→성수기/평시/한산 태세) + 매출 액션에 지수·전주대비·주말날씨·규모힌트(평소比 +20~30%) why. OwnerAction에 quant(지수) 추가 → 카드에 수요지수 배지. 검증(/api/me/owner-brief): '87 · 매우높음→성수기 태세 · 수요지수 87/100(전주+79)·+45 계절·+8 주말'. #1 퍼널이 개선 전후 전환율 자동 측정. backend owner/brief.ts, web owner-home·api/owner
- 2026-08-02 · 멤버십 사전신청 전환 측정(#1): /membership에 방문(trackEvent membership_view+출처 utm/리퍼러)·CTA클릭(membership_cta+plan) 추적, 사전신청은 subscription_leads. 관리자 보고서 GET /api/admin/report/membership-funnel(방문·CTA·신청·전환율·플랜별·출처Top·14일추세) + '📈 전환·구독' 탭. 첫달무료→유료 전환/유지는 결제 연동 후(현재 PoC라 프레임만). 검증: membership_view uid포함 기록 ok:true. backend report/router.ts, web membership/page·admin/report·api/report
- 2026-08-02 · 기사 나레이션 외부 연결 + 기사 공유 기능: ①공개 오디오 CORS 전면개방 — 전역 /api/* CORS 뒤에 app.use('/api/audio/*', cors(origin:'*', GET/OPTIONS)) → 어느 외부 사이트에서도 JS 재생·임베드(검증 example.com→ACAO:*). ②오디오 캐시 private→public(뉴스 max-age=604800 immutable·팟캐스트/브리핑 public)로 CDN 엣지 캐싱. ③기사 헤더에 ShareBar — 공유(Web Share API·미지원 시 링크복사)+오디오 드롭다운(오디오 링크 복사·<audio> 임베드 코드 복사). 나레이션 URL=/api/audio/news/:idxno(공개·Range). backend index.ts·audio/router.ts, web app/news/[id]/article-client.tsx
- 2026-08-02 · 지역경제에 부동산 실거래 요약 추가(/live): 기존 RealEstatePanel(국토부 실거래)에 compact 옵션 추가 → /live 지역경제에 아파트 평균·최고·최저·건수 + 토지(표 없이 요약, 2열)로 유가 위에 배치. 리포트는 표까지 그대로. (수산물 시세=②는 KAMIS 키/data.go.kr 활용신청 평일 승인 후 진행 예정) web/src/components/reports/report-charts.tsx(RealEstatePanel compact)·app/live/page.tsx
- 2026-08-02 · 주간 리포트 타이틀·서브제목 축소: Masthead h1 text-display→text-3xl/4xl(패딩·간격 축소), 남은 서브제목(카드뉴스·군정소식·주요뉴스·데이터) text-display-sm→text-xl로 통일. 리포트 제목 위계 일관·콤팩트. web/src/components/reports/report-reader.tsx
- 2026-08-02 · 주간 리포트 섹션 제목 축소(너무 큼): 번호 마커 text-3xl→lg, 제목 text-display-sm→xl, 섹션 간격 space-y-14→10·mt-10→8, accent-rule mt-3→2. 이모지도 제목 따라 축소. web/src/components/reports/report-reader.tsx
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
