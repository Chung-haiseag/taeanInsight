// 관리자 보고서 — 데이터 규모·신선도·외부연동 요약(읽기 전용). /api/admin/report 하위(adminGuard 상속).
//   각 집계는 방어적(실패 시 null). config는 시크릿 '설정 여부'(불리언)만 — 값은 절대 노출하지 않는다.
import { Hono } from "hono";
import type { Env } from "../types";

export const reportRouter = new Hono<{ Bindings: Env }>();

async function scalar(db: D1Database, sql: string): Promise<number | null> {
  try { const r = await db.prepare(sql).first<{ n: number }>(); return r?.n ?? 0; } catch { return null; }
}
async function text1(db: D1Database, sql: string): Promise<string | null> {
  try { const r = await db.prepare(sql).first<{ v: string | null }>(); return r?.v ?? null; } catch { return null; }
}
async function rows<T = Record<string, unknown>>(db: D1Database, sql: string): Promise<T[]> {
  try { const r = await db.prepare(sql).all<T>(); return r.results ?? []; } catch { return []; }
}

// 멤버십 사전신청 전환 퍼널 — 방문(usage_events membership_view)→CTA→신청(subscription_leads)→전환율.
//   첫달무료→유료 전환/유지는 결제(PG) 연동 후 채워짐(현재 PoC라 데이터 없음).
reportRouter.get("/membership-funnel", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const [views, ctaClicks, leads] = await Promise.all([
    scalar(db, "SELECT COUNT(*) n FROM usage_events WHERE type='membership_view'"),
    scalar(db, "SELECT COUNT(*) n FROM usage_events WHERE type='membership_cta'"),
    scalar(db, "SELECT COUNT(*) n FROM subscription_leads"),
  ]);
  const [leadsByPlan, ctaByPlan, viewsBySource, viewsDaily, leadsDaily] = await Promise.all([
    rows(db, "SELECT plan, COUNT(*) n FROM subscription_leads GROUP BY plan"),
    rows(db, "SELECT ref plan, COUNT(*) n FROM usage_events WHERE type='membership_cta' AND ref IS NOT NULL GROUP BY ref"),
    rows(db, "SELECT COALESCE(NULLIF(ref,''),'direct') src, COUNT(*) n FROM usage_events WHERE type='membership_view' GROUP BY src ORDER BY n DESC LIMIT 8"),
    rows(db, "SELECT substr(created_at,1,10) day, COUNT(*) n FROM usage_events WHERE type='membership_view' AND created_at >= date('now','-14 day') GROUP BY day ORDER BY day"),
    rows(db, "SELECT substr(created_at,1,10) day, COUNT(*) n FROM subscription_leads WHERE created_at >= date('now','-14 day') GROUP BY day ORDER BY day"),
  ]);
  const conversion = views && views > 0 ? (leads ?? 0) / views : null;
  return c.json({
    views: views ?? 0, ctaClicks: ctaClicks ?? 0, leads: leads ?? 0, conversion,
    leadsByPlan, ctaByPlan, viewsBySource, viewsDaily, leadsDaily,
    paid: null, // 첫달무료→유료 전환/유지: 결제 연동 후
  });
});

reportRouter.get("/summary", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);

  const [
    articles, ebook, kgNodes, kgEdges, users, regionalNews, facts,
    pendingApplications, pushSubs, citizenArticles, govNotices, weeklyReports, envDays, reporters,
  ] = await Promise.all([
    scalar(db, "SELECT COUNT(*) n FROM archive_articles"),
    scalar(db, "SELECT COUNT(*) n FROM archive_articles WHERE idxno BETWEEN 90000001 AND 90099999"),
    scalar(db, "SELECT COUNT(*) n FROM kg_nodes"),
    scalar(db, "SELECT COUNT(*) n FROM kg_edges"),
    scalar(db, "SELECT COUNT(*) n FROM users"),
    scalar(db, "SELECT COUNT(*) n FROM regional_news"),
    scalar(db, "SELECT COUNT(*) n FROM facts"),
    scalar(db, "SELECT COUNT(*) n FROM citizen_applications WHERE status='pending'"),
    scalar(db, "SELECT COUNT(*) n FROM push_subscriptions"),
    scalar(db, "SELECT COUNT(*) n FROM citizen_articles"),
    scalar(db, "SELECT COUNT(*) n FROM gov_notices"),
    scalar(db, "SELECT COUNT(*) n FROM weekly_reports"),
    scalar(db, "SELECT COUNT(*) n FROM env_daily"),
    scalar(db, "SELECT COUNT(*) n FROM reporters"),
  ]);

  const [latestArticle, latestRegional, latestEnv, lastCollected] = await Promise.all([
    text1(db, "SELECT MAX(published_at) v FROM archive_articles"),
    text1(db, "SELECT MAX(published_at) v FROM regional_news"),
    text1(db, "SELECT MAX(date) v FROM env_daily"),
    text1(db, "SELECT updated_at v FROM news_cache WHERE id=1"), // 뉴스 수집기 마지막 실행 시각(고장 vs 새글 없음 구분)
  ]);

  // 관광 분석 데이터 소스 현황 — 라이브 지표 + 상태 기록(정리·상설 기록).
  const [visitorRows, visitorFrom, visitorTo, demandTotal, demandFilled, trafficSnaps] = await Promise.all([
    scalar(db, "SELECT COUNT(*) n FROM tour_visitors WHERE signgu_code='44825'"),
    text1(db, "SELECT MIN(base_ymd) v FROM tour_visitors WHERE signgu_code='44825'"),
    text1(db, "SELECT MAX(base_ymd) v FROM tour_visitors WHERE signgu_code='44825'"),
    scalar(db, "SELECT COUNT(DISTINCT weekend_sat) n FROM tour_demand_log"),
    scalar(db, "SELECT COUNT(DISTINCT weekend_sat) n FROM tour_demand_log WHERE actual_visit IS NOT NULL"),
    scalar(db, "SELECT COUNT(*) n FROM traffic_daily"),
  ]);
  const ymd = (s: string | null) => (s ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : "?");
  // status: live(가동) | progress(진행중) | check(확인필요) | parked(보류) | rejected(미채택)
  const dataSources = [
    { key: "visitors", name: "관광 방문자 실측 (KTO 빅데이터)", status: "live", granularity: "태안군·일별·외지인/현지인/외국인",
      metric: visitorRows != null ? `${visitorRows.toLocaleString()}행 · ${ymd(visitorFrom)}~${ymd(visitorTo)}` : null,
      note: "수요지수 정답(백테스트) + seasonBase 데이터 재보정" },
    { key: "demandActuals", name: "수요지수 백테스트 정답", status: "live", granularity: "주말별",
      metric: `실측 채움 ${demandFilled ?? 0}/${demandTotal ?? 0} 주말`,
      note: "예측 vs 실제 방문자 대조(≥4주 시 적중률 공개)" },
    { key: "beaches", name: "해수욕장 보드 (KHOA+기상청)", status: "live", granularity: "해수욕장별",
      metric: "/beaches 공개", note: "수온·파고·해수욕지수 종합 적합도 랭킹" },
    { key: "festivals", name: "태안 축제·행사 캘린더 (큐레이션)", status: "live", granularity: "축제별·시기",
      metric: "13개 축제", note: "TourAPI 태안 0건→큐레이션 대체. 수요 동인 반영(대형=튤립·대하). 방문자 실측 피크와 일치 검증. 매년 공식일정 갱신" },
    { key: "weather", name: "날씨 (기상청 단기예보)", status: "live", granularity: "태안 격자·주말",
      metric: (c.env as unknown as Record<string, unknown>).DATA_GO_KR_KEY ? "키 설정됨" : "키 없음", note: "수요지수 입력" },
    { key: "alert", name: "기상특보 (기상청)", status: "live", granularity: "충남 광역·실시간",
      metric: "/api/conditions/weather-alert", note: "태풍·호우·풍랑·폭염 발효=수요 급감 요인+안전배너. 활용신청 완료" },
    { key: "search", name: "검색 관심도·숙박 proxy (네이버 데이터랩)", status: "parked", granularity: "태안 키워드+숙박",
      metric: null, note: "❌NAVER가 데이터랩 검색어트렌드 API 신규 등록 중단(기존앱 추가·신규앱 모두 불가 확인). 코드는 완성·null-safe로 휴면(전용키 NAVER_DATALAB_* 지원). 대체 숙박수요 소스(KTO 숙박통계 등) 검토 예정. 수요지수는 보조요인이라 없어도 정상" },
    { key: "holiday", name: "공휴일 연휴 요인 (특일정보)", status: "live", granularity: "월별",
      metric: "특일정보 활용신청 완료", note: "공휴일·대체공휴일로 주말 인접 연휴 가산(DATA_GO_KR_KEY_TOUR 사용)" },
    { key: "traffic", name: "충남 고속도로 유입 교통량 (도로공사)", status: "live", granularity: "대전충남본부·시간당",
      metric: trafficSnaps != null ? `스냅샷 ${trafficSnaps}건` : "실시간 /api/conditions/traffic",
      note: "출구(진출=도착 유입) 선행지표. 태안 단독 IC 실시간 미제공→권역 프록시" },
    { key: "mudflat", name: "갯벌 물때 적기 (KHOA 조석)", status: "live", granularity: "안흥·일별 5일",
      metric: "/api/conditions/mudflat", note: "조차(사리)+낮 간조로 갯벌 체험 적기·최적일 추천(/beaches)" },
    { key: "agri", name: "농산물 도매 시세 (공영도매시장 경매)", status: "live", granularity: "품목별·일별",
      metric: "/api/conditions/agri", note: "마늘·생강·고추·감자·양파 전국 도매 낙찰가 중앙값(태안 주산지). data.go.kr 15141808, 우리 키" },
    { key: "industry", name: "태안 산업 구조", status: "live", granularity: "부문(농업·수산·관광·에너지)",
      metric: "/live 지역경제(큐레이션)", note: "통계청 지역총생산·사업체조사 기준 구조 카드. 정밀 최신 산업별 취업자는 KOSIS OpenAPI 키(kosis.kr 무료) 연동 예정" },
    { key: "seafood", name: "수산물 시세 (해조류 라이브)", status: "live", granularity: "품목별",
      metric: "미역·다시마·파래 도매가", note: "해조류는 우리 키로 라이브(농수산물 카드). 어패류(우럭·꽃게·바지락)는 이 API에 없음→KAMIS 소매가 키(kamis.or.kr) 필요" },
    { key: "consumption", name: "관광소비·수요강도·다양성 (카드)", status: "parked", granularity: "시군구·월별",
      metric: null, note: "승인됐으나 전 조회 빈 응답(미적재). 파생지표라 보류" },
    { key: "attractions", name: "관광지점 입장객 (문화관광연구원)", status: "rejected", granularity: "지점별·월별",
      metric: null, note: "태안 등록 5개 시설뿐·해수욕장 누락 → 반쪽이라 미채택" },
  ];

  // 외부 연동 설정 여부(값 아님). env를 레코드로 보고 존재만 확인.
  const e = c.env as unknown as Record<string, unknown>;
  const has = (k: string) => !!e[k];
  const config = {
    taeanLogin: has("TAEAN_ID") && has("TAEAN_PW"),
    dataGoKr: has("DATA_GO_KR_KEY"),
    naver: has("NAVER_CLIENT_ID") && has("NAVER_CLIENT_SECRET"),
    kakao: has("KAKAO_REST_KEY"),
    webSearch: has("WEB_SEARCH_API_KEY"),
    opinet: has("OPINET_KEY"),
    push: has("VAPID_PRIVATE_KEY"),
    adminToken: has("ADMIN_TOKEN"),
    slack: has("SLACK_WEBHOOK_URL"),
  };

  return c.json({
    counts: {
      articles, ebook, kgNodes, kgEdges, users, regionalNews, facts,
      pendingApplications, pushSubs, citizenArticles, govNotices, weeklyReports, envDays, reporters,
    },
    freshness: { latestArticle, latestRegional, latestEnv, lastCollected },
    config,
    dataSources,
    generatedAt: new Date().toISOString(),
  });
});
